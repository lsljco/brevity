import { useEffect, useId, useRef, useState } from 'react'
import { fmtMoney } from './projection.js'
import { bankActivityPreview, bankBalanceMovement, cashForecastSourceSeverity } from './calendarSemantics.js'
import { isTransferTransaction } from './reportingData.js'
import { transactionDescription } from './transactionList.js'

export function CashForecastIntro({ monthName, showBankActivity, error, freshnessMessage, freshnessStatus, balanceMessage, balanceStatus, excludedAccountCount = 0, unmappedTransactionCount = 0, balanceSource = 'stored account balances', balanceVerifiedLive = false, todayPlanUnresolved = false }) {
  const sourceSeverity = cashForecastSourceSeverity({ error, freshnessStatus, balanceStatus, unmappedTransactionCount })
  return (
    <>
      <section className="finance-calendar-intro" aria-labelledby="cash-forecast-title">
        <p>Finance planning</p>
        <h1 id="cash-forecast-title">Cash Forecast</h1>
        <p className="finance-calendar-simple-guide">Today separates your bank balance from your projected balance after pending and remaining scheduled activity. Future dates carry that projection forward. Scheduled items are plans, not proof of payment.</p>
        {todayPlanUnresolved && <p className="finance-calendar-simple-guide">Some of today’s scheduled items have not been matched to bank activity. They remain in the projection as expected activity until matched.</p>}
        <details className="finance-calendar-explanation"><summary>How this forecast works</summary><span>
          Scheduled activity, reconstructed posted closes, and forward cash-balance projections for {monthName}.
          {showBankActivity ? ' Bank activity is shown separately from the plan.' : ' Turn on bank activity to compare posted and pending transactions with the plan.'}
          {excludedAccountCount ? ` ${excludedAccountCount} selected non-cash account${excludedAccountCount === 1 ? ' is' : 's are'} excluded; this forecast includes checking and savings only.` : ''}
          {unmappedTransactionCount ? ` Across all bank history, ${unmappedTransactionCount} transaction${unmappedTransactionCount === 1 ? ' is' : 's are'} not linked to one unique Brevity account and ${unmappedTransactionCount === 1 ? 'is' : 'are'} excluded from this forecast.` : ''}
          {` The balance anchor uses ${balanceSource}.`}
          {' Posted items are already in the bank balance. Pending and unmatched scheduled activity adjust the projection once; uncertain matches remain estimates.'}
        </span></details>
      </section>
      {(error || freshnessMessage || balanceMessage || unmappedTransactionCount > 0) && (
        <div
          className={`finance-calendar-source-status finance-calendar-source-status--${sourceSeverity}`}
          role={sourceSeverity === 'error' ? 'alert' : 'status'}
        >
          <details><summary className="finance-calendar-source-status-label">
            {sourceSeverity === 'error' ? 'Bank update failed — view details' : sourceSeverity === 'attention' ? 'Bank update needs attention — view details' : 'Bank update details'}
          </summary>
          {balanceMessage && <span><strong>Balance anchor status:</strong> {balanceMessage}</span>}
          {(error || freshnessMessage) && <span><strong>Transaction snapshot status:</strong> {error || freshnessMessage} Bank activity below uses this exact-account snapshot; reconstructed closes appear only when every included cash account has a verified live ledger anchor and this transaction snapshot is fresh.</span>}
          {unmappedTransactionCount > 0 && <span><strong>Excluded bank activity:</strong> Review unlinked rows in Finance › Transactions with all accounts selected.</span>}
          </details>
        </div>
      )}
    </>
  )
}

export default function CashForecastAgenda({
  vendorOrder='',
  cells,
  projection,
  actualsByDate,
  showBankActivity,
  todayKey,
  selectedDay,
  historicalBalances,
  monthName,
  balanceSource,
  balanceVerifiedLive,
  todayPlanUnresolved,
  hasCashAccounts = true,
  onSelectDay,
}) {
  const [showEarlier, setShowEarlier] = useState(false)
  const agendaRef = useRef(null)
  const pendingDetailFocusRef = useRef(false)
  const detailId = `cash-forecast-day-detail-${useId().replace(/:/g, '')}`
  const orderRows=rows=>vendorOrder?[...rows].sort((a,b)=>String(a.vendorName||'Unassigned').localeCompare(String(b.vendorName||'Unassigned'))*(vendorOrder==='desc'?-1:1)):rows
  const days = cells
    .filter(cell => cell.cur)
    .map(cell => {
      const key = `${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`
      const point = projection.get(key)
      const planned = orderRows(point?.txns || [])
      const bank = orderRows(showBankActivity && key <= todayKey ? (actualsByDate?.[key] || []) : [])
      const postedBank = bank.filter(transaction => !transaction?.pending)
      const pendingBank = bank.filter(transaction => transaction?.pending)
      const reconstructedBalance = key < todayKey ? historicalBalances[key] : undefined
      return {
        key,
        currentBalance:point?.currentBalance,
        planned,
        bank,
        plannedNet:Number(point?.delta || 0),
        bankNet:bankBalanceMovement(postedBank),
        pendingNet:bankBalanceMovement(pendingBank),
        postedBankCount:postedBank.length,
        pendingBankCount:pendingBank.length,
        balance:reconstructedBalance !== undefined ? reconstructedBalance : key < todayKey ? undefined : point?.bal,
        balanceIsReconstructed:reconstructedBalance !== undefined,
      }
    })
    .filter(day => day.key === todayKey || day.key === selectedDay || day.planned.length > 0 || day.bank.length > 0)

  const includesToday = days.some(day => day.key === todayKey)
  const earlierCount = includesToday ? days.filter(day => day.key < todayKey).length : 0
  const visibleDays = includesToday && !showEarlier ? days.filter(day => day.key >= todayKey || day.key === selectedDay) : days

  useEffect(() => {
    if (!selectedDay || !pendingDetailFocusRef.current || typeof window === 'undefined') return undefined
    const frame = window.requestAnimationFrame(() => {
      pendingDetailFocusRef.current = false
      const detailHeader = agendaRef.current?.parentElement?.querySelector('.finance-calendar-day-header')
      const detail = detailHeader?.closest('.finance-card')
      if (!detail) return
      detail.id = detailId
      detail.tabIndex = -1
      detail.scrollIntoView({
        behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block:'start',
      })
      detail.focus({ preventScroll:true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [detailId, selectedDay])

  if (!hasCashAccounts) {
    return (
      <div className="finance-calendar-agenda-empty" role="status">
        No checking or savings account is selected. Choose a cash account to build a cash forecast; non-cash accounts are not converted into a $0 balance.
      </div>
    )
  }

  return (
    <div ref={agendaRef} className="finance-calendar-mobile-agenda" aria-label={`${monthName} cash forecast agenda`}>
      {earlierCount > 0 && <div className="finance-calendar-earlier"><button type="button" aria-expanded={showEarlier} onClick={() => setShowEarlier(value => !value)}>{showEarlier ? 'Hide' : 'Show'} earlier days ({earlierCount})</button></div>}
      {visibleDays.length > 0 ? visibleDays.map(day => {
        const plannedPreview = day.planned.slice(0, 3).map(tx => ({ label:tx.vendorName && tx.vendorName !== 'Unassigned' ? `${tx.vendorName} · ${transactionDescription(tx)}` : transactionDescription(tx), amount:Number(tx.amount || 0), direction:tx.type }))
        const namedBankTransactions = day.bank.filter(transaction => transactionDescription(transaction))
        const bankPreview = (vendorOrder?namedBankTransactions.slice(0,2):bankActivityPreview(namedBankTransactions)).map(transaction => {
          const label = transactionDescription(transaction)
          const tags = [transaction?.pending ? 'Pending' : 'Posted', isTransferTransaction(transaction) ? 'Transfer' : ''].filter(Boolean)
          return label ? `${tags.join(' · ')} · ${label}` : ''
        }).filter(Boolean)
        const selected = day.key === selectedDay
        const dateLabel = new Date(`${day.key}T12:00:00`).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
        const plannedNetLabel = `${day.plannedNet >= 0 ? 'plus' : 'minus'} ${fmtMoney(Math.abs(day.plannedNet))}`
        const balanceKind = day.balanceIsReconstructed
          ? 'Balance from posted activity'
          : day.key < todayKey
            ? 'Past balance unavailable'
            : day.key === todayKey
              ? 'Projected after today’s activity'
              : todayPlanUnresolved
                ? 'Forecast balance · payments need confirmation'
                : 'Forecast balance'
        const pendingSummary = day.pendingBankCount
          ? ` ${day.pendingBankCount} pending authorization${day.pendingBankCount === 1 ? '' : 's'}; pending movement ${day.pendingNet >= 0 ? 'plus' : 'minus'} ${fmtMoney(Math.abs(day.pendingNet))}, shown separately and not counted as posted.`
          : ''
        const bankSummary = showBankActivity
          ? ` ${day.bank.length} bank transaction${day.bank.length === 1 ? '' : 's'}: ${day.postedBankCount} posted and ${day.pendingBankCount} pending; posted balance movement including transfers ${day.bankNet >= 0 ? 'plus' : 'minus'} ${fmtMoney(Math.abs(day.bankNet))}.${pendingSummary}`
          : ''
        const rowLabel = `${dateLabel}. ${day.planned.length} planned item${day.planned.length === 1 ? '' : 's'}; planned net ${plannedNetLabel}.${bankSummary}${day.balance !== undefined ? ` ${balanceKind}: ${fmtMoney(day.balance)}.` : ''} ${selected ? 'Close' : 'Open'} cash forecast details.`
        return (
          <button
            type="button"
            key={day.key}
            className={selected ? 'is-selected' : ''}
            onClick={() => {
              pendingDetailFocusRef.current = !selected
              onSelectDay(selected ? null : day.key)
            }}
            aria-label={rowLabel}
            aria-expanded={selected}
            aria-controls={detailId}
          >
            <span className="finance-calendar-agenda-date">
              <strong>{new Date(`${day.key}T12:00:00`).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}</strong>
              <small>{day.key === todayKey ? 'Today · ' : ''}{day.planned.length} scheduled item{day.planned.length === 1 ? '' : 's'}{showBankActivity ? ` · ${day.bank.length} bank transaction${day.bank.length === 1 ? '' : 's'}` : ''}</small>
            </span>
            {day.balance !== undefined && (
              <span className="finance-calendar-agenda-values" title={`Balance anchor: ${balanceSource}`}>
                {day.currentBalance !== undefined && <small>{balanceVerifiedLive ? 'Current bank balance' : 'Last saved bank balance'}: {fmtMoney(day.currentBalance)}</small>}
                <small>{balanceKind}</small>
                <strong>{fmtMoney(day.balance)}</strong>
              </span>
            )}
            <span className="finance-calendar-agenda-activity">
              {day.key < todayKey && !day.balanceIsReconstructed && <small>Past bank balance unavailable from the current bank data.</small>}
              {!showBankActivity && day.key <= todayKey && <small>Bank transactions are hidden. Use “Show bank activity” above to compare.</small>}
              {day.planned.length > 0 && (
                <span className="finance-calendar-agenda-group finance-calendar-agenda-group--planned">
                  <span className="finance-calendar-agenda-group-heading">
                    <small>{day.key < todayKey ? 'Was scheduled' : 'Scheduled'}</small>
                    <strong>Net {day.plannedNet >= 0 ? '+' : '−'}{fmtMoney(Math.abs(day.plannedNet))}</strong>
                  </span>
                  <span className="finance-calendar-agenda-preview">
                    {plannedPreview.map((item, index) => <span className="finance-calendar-agenda-item" key={index}><span>{item.label}</span><strong>{item.direction === 'income' ? '+' : item.direction === 'transfer' ? '' : '−'}{fmtMoney(Math.abs(item.amount))}</strong></span>)}
                    {day.planned.length > plannedPreview.length && <small>+{day.planned.length - plannedPreview.length} more scheduled · tap for details</small>}
                    {day.key <= todayKey && <small>Scheduled does not mean paid or received.</small>}
                  </span>
                </span>
              )}
              {showBankActivity && day.bank.length > 0 && (
                <span className="finance-calendar-agenda-group finance-calendar-agenda-group--bank">
                  <span className="finance-calendar-agenda-group-heading">
                    <small>Bank activity · {day.postedBankCount} posted{day.pendingBankCount ? ` · ${day.pendingBankCount} pending` : ''}</small>
                    <strong>Posted movement {day.bankNet >= 0 ? '+' : '−'}{fmtMoney(Math.abs(day.bankNet))}</strong>
                  </span>
                  <span className="finance-calendar-agenda-preview">
                    {day.pendingBankCount > 0 && <small>Pending authorizations {day.pendingNet >= 0 ? '+' : '−'}{fmtMoney(Math.abs(day.pendingNet))} · excluded from posted movement</small>}
                    {bankPreview.map((label, index) => <small key={`${label}-${index}`}>{label}</small>)}
                    {day.bank.length > bankPreview.length && <small>+{day.bank.length - bankPreview.length} more bank transactions</small>}
                  </span>
                </span>
              )}
              {day.planned.length === 0 && (!showBankActivity || day.bank.length === 0) && <small className="finance-calendar-agenda-no-activity">No scheduled activity</small>}
              <small className="finance-calendar-day-link">{selected ? 'Close' : 'View'} day details →</small>
            </span>
          </button>
        )
      }) : (
        <div className="finance-calendar-agenda-empty">No planned or bank activity for this month.</div>
      )}
    </div>
  )
}
