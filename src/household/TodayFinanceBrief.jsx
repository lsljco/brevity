import { useEffect, useMemo, useState } from 'react'
import { loadFinanceData } from '../finance/financeData.js'
import { FINANCE_REFRESH_EVENT, FINANCE_STORAGE_KEY, PLAID_ACTUALS_KEY, readLatestBalanceRefreshStatus, readTransactionFreshness } from '../finance/financeRefresh.js'
import { buildMeetingCashScope } from '../finance/financeMeetingTruth.js'
import { isTransferTransaction } from '../finance/reportingData.js'
import { addDays, parseISODate, toISO, txOccursOnDate } from '../finance/projection.js'
import { getHouseholdCalendarDate } from '../finance/financeTime.js'
import { SHARED_STATE_EVENT } from './sharedState.js'
import './TodayFinanceBrief.css'

const money = value => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(value)
const dateLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })
const finite = value => value !== '' && value != null && Number.isFinite(Number(value))
const OPERATING_FLOOR = 1000

function operatingForecast(accounts, scheduled, date) {
  const account = accounts.find(item => item.id === 'a1' || /\boperating\b/i.test(String(item.name || '')))
  if (!account || !finite(account.balance)) return { days:null, reason:'Operating Balance is unavailable. Link or enter the Operating Account balance to see the $1,000 watch.' }
  const today = getHouseholdCalendarDate()
  const selected = parseISODate(date)
  if (!selected) return { days:null, reason:'The selected day is unavailable.' }
  const end = addDays(selected, 6)
  let balance = Number(account.balance)
  const days = []
  for (let day = today; day <= end; day = addDays(day, 1)) {
    // The stored balance already reflects activity posted today. Project from tomorrow.
    if (day > today) for (const item of scheduled) {
      if (!txOccursOnDate(item, day)) continue
      const relevant = item.type === 'transfer' ? item.acct === account.id || item.transferTo === account.id : item.acct === account.id
      if (!relevant) continue
      if (!finite(item.amount)) return { days:null, reason:'An Operating Account schedule has no amount, so the $1,000 forecast is unavailable.' }
      const amount = Math.abs(Number(item.amount))
      if (item.type === 'income' || (item.type === 'transfer' && item.transferTo === account.id && item.acct !== account.id)) balance += amount
      if (item.type === 'expense' || (item.type === 'transfer' && item.acct === account.id && item.transferTo !== account.id)) balance -= amount
    }
    if (day >= selected) days.push({ date:toISO(day), balance:Math.round(balance * 100) / 100 })
  }
  return { days, reason:null }
}

export function buildTodayFinanceBrief({ date, data, actuals, balanceStatus, transactionStatus }) {
  const accounts = Array.isArray(data?.accounts) ? data.accounts : []
  const scheduled = Array.isArray(data?.transactions) ? data.transactions : []
  const scope = buildMeetingCashScope({ accounts, scheduled, actuals:Array.isArray(actuals) ? actuals : [], balanceDataStatus:balanceStatus?.status, transactionFreshnessStatus:transactionStatus?.status, today:parseISODate(date) })
  const cash = scope.hasCashAccounts && scope.accounts.every(account => finite(account.balance)) ? scope.accounts.reduce((sum, account) => sum + Number(account.balance), 0) : null
  const verified = scope.balanceDataStatus === 'fresh' && scope.hasVerifiedCashAnchors
  const operating = operatingForecast(accounts, scheduled, date)
  const belowFloor = operating.days?.filter(day => day.balance < OPERATING_FLOOR) || []
  const rows = []
  for (let offset = 0; offset < 7; offset += 1) {
    const day = addDays(parseISODate(date), offset)
    for (const item of scope.scheduled) {
      if (!['income','expense'].includes(item.type) || !txOccursOnDate(item, day)) continue
      const occurrenceDate = toISO(day)
      const reconciled = scope.actualMetricsAvailable && scope.actuals.some(actual => !actual.pending && actual.date === occurrenceDate && (actual.reconciledScheduledId || actual.scheduledTransactionId) === item.id && (actual.reconciledOccurrenceDate || actual.scheduledOccurrenceDate) === occurrenceDate)
      rows.push({ id:`${item.id}-${occurrenceDate}`, title:item.name || item.description || 'Scheduled item', date:occurrenceDate, amount:finite(item.amount) ? Math.abs(Number(item.amount)) : null, type:item.type, status:reconciled ? 'Posted · linked' : 'Scheduled · unconfirmed' })
    }
  }
  const due = rows.filter(row => row.type === 'expense' && row.status !== 'Posted · linked')
  const inflows = rows.filter(row => row.type === 'income' && row.status !== 'Posted · linked')
  const posted = scope.actualMetricsAvailable && transactionStatus?.status === 'fresh'
    ? scope.actuals.filter(item => !item.pending && item.date === date && !isTransferTransaction(item)).length : null
  const uncategorized = scope.actualMetricsAvailable && transactionStatus?.status === 'fresh'
    ? scope.actuals.filter(item => !item.pending && item.date === date && !String(item.category || item.cat || '').trim()).length : null
  const alerts = []
  if (!verified) alerts.push('Bank balance is not verified live. Review the balance before making a cash decision.')
  if (transactionStatus?.status !== 'fresh') alerts.push('Posted bank activity is not verified in the latest transaction refresh.')
  if (uncategorized) alerts.push(`${uncategorized} posted transaction${uncategorized === 1 ? '' : 's'} need categorization.`)
  return { cash, verified, checkedAt:verified ? balanceStatus.checkedAt : '', due, inflows, posted, alerts, operating, belowFloor }
}

function readSnapshot() {
  try {
    const loaded = loadFinanceData(localStorage, FINANCE_STORAGE_KEY)
    const actuals = JSON.parse(localStorage.getItem(PLAID_ACTUALS_KEY) || 'null')
    return { data:loaded.data, actuals, balanceStatus:readLatestBalanceRefreshStatus(), transactionStatus:readTransactionFreshness(localStorage) }
  } catch { return { data:null, actuals:null, balanceStatus:{status:'unknown'}, transactionStatus:{status:'unknown'} } }
}

export default function TodayFinanceBrief({ date, finance = {}, canViewFinance = false, onOpenFinance }) {
  const [snapshot, setSnapshot] = useState(() => canViewFinance ? readSnapshot() : null)
  useEffect(() => {
    if (!canViewFinance) return undefined
    const refresh = event => {
      if (event?.type === 'storage' && ![FINANCE_STORAGE_KEY, PLAID_ACTUALS_KEY].includes(event.key)) return
      if (event?.type === SHARED_STATE_EVENT && !event.detail?.keys?.includes(FINANCE_STORAGE_KEY)) return
      setSnapshot(readSnapshot())
    }
    window.addEventListener(FINANCE_REFRESH_EVENT, refresh)
    window.addEventListener(SHARED_STATE_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener(FINANCE_REFRESH_EVENT, refresh); window.removeEventListener(SHARED_STATE_EVENT, refresh); window.removeEventListener('storage', refresh) }
  }, [canViewFinance])
  const model = useMemo(() => canViewFinance ? buildTodayFinanceBrief({ date, ...(snapshot || readSnapshot()) }) : null, [date, snapshot, canViewFinance])
  return <section className="today-section today-finance-brief" data-pillar="finance" aria-label="Pillar 6 Finance">
    <div className="today-section-heading"><div><span>Pillar 6 · Finance</span><h2>Daily Finance Brief</h2></div><button type="button" onClick={() => onOpenFinance?.('finance')}>Open Finance <i className="ti ti-arrow-right" aria-hidden="true" /></button></div>
    {!canViewFinance ? <p className="today-finance-restricted">Financial details are available to the household administrator.</p> : <>
      <div className="today-finance-metrics"><article><span>Cash position</span><strong>{model.cash === null ? 'Unavailable' : money(model.cash)}</strong><small>{model.verified ? `Live bank balance verified ${new Date(model.checkedAt).toLocaleString()}` : 'Latest stored balance · live verification unavailable'}</small></article><article><span>Due in 7 days</span><strong>{model.due.length} scheduled</strong><small>{model.due.reduce((sum, row) => sum + (row.amount || 0), 0) ? `${money(model.due.reduce((sum, row) => sum + (row.amount || 0), 0))} planned` : 'No scheduled expenses found'}</small></article><article><span>Expected income</span><strong>{model.inflows.length} scheduled</strong><small>{model.inflows.reduce((sum, row) => sum + (row.amount || 0), 0) ? `${money(model.inflows.reduce((sum, row) => sum + (row.amount || 0), 0))} planned` : 'No scheduled income found'}</small></article></div>
      <div className={`today-operating-watch${model.belowFloor.length ? ' is-below-floor' : ''}`} role="status"><h3>Operating Balance · $1,000 watch</h3>{model.operating.reason ? <p>{model.operating.reason}</p> : model.belowFloor.length ? <><p>Projected below $1,000 on {model.belowFloor.length} of the next seven days. Review disbursements in Finance.</p><ul>{model.belowFloor.map(day => <li key={day.date}><span>{dateLabel(day.date)}</span><strong>{money(day.balance)}</strong></li>)}</ul></> : <p>Projected at or above $1,000 throughout these seven days.</p>}<small>Forecast uses the latest stored Operating Account balance and scheduled activity. Verify current bank activity before adjusting funds.</small></div>
      <div className="today-finance-details"><div><h3>Due next</h3>{model.due.length ? <ul>{model.due.slice(0, 4).map(row => <li key={row.id}><span>{dateLabel(row.date)} · {row.title} <em>{row.status}</em></span><strong>{row.amount === null ? 'Amount unavailable' : money(row.amount)}</strong></li>)}</ul> : <p>No expenses scheduled for the next seven days.</p>}</div><div><h3>Today’s decision</h3><p>{finance.requiredOutput || finance.decisionRule || finance.discussionPrompt || 'No finance decision recorded today.'}</p><small>{model.posted === null ? 'Posted activity unverified' : `${model.posted} posted transaction${model.posted === 1 ? '' : 's'} recorded today`}</small></div></div>
      {model.alerts.length > 0 && <div className="today-finance-alerts" role="status"><strong>Needs attention</strong><ul>{model.alerts.map(item => <li key={item}>{item}</li>)}</ul></div>}
      <p className="today-finance-note">Scheduled items are plans, not proof of payment or income received. Brevity does not move money from this card.</p>
    </>}
  </section>
}
