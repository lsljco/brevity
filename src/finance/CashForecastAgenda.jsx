import { useEffect, useId, useRef } from 'react'
import { fmtMoney } from './projection.js'
import { bankBalanceMovement } from './calendarSemantics.js'
import { isTransferTransaction } from './reportingData.js'
import { transactionDescription } from './transactionList.js'

export function CashForecastIntro({ monthName, showBankActivity, error, freshnessMessage, freshnessStatus, balanceMessage, balanceStatus, excludedAccountCount = 0, unmappedTransactionCount = 0, balanceSource = 'stored account balances', balanceVerifiedLive = false, todayPlanUnresolved = false }) {
  const warning = Boolean(error) || unmappedTransactionCount > 0 || freshnessStatus !== 'fresh' || balanceStatus !== 'fresh'
  return (
    <>
      <section className="finance-calendar-intro" aria-labelledby="cash-forecast-title">
        <p>Finance planning</p>
        <h1 id="cash-forecast-title">Cash Forecast</h1>
        <span>
          Scheduled activity, reconstructed posted closes, and forward cash-balance projections for {monthName}.
          {showBankActivity ? ' Bank activity is shown separately from the plan.' : ' Turn on bank activity to compare posted and pending transactions with the plan.'}
          {excludedAccountCount ? ` ${excludedAccountCount} selected non-cash account${excludedAccountCount === 1 ? ' is' : 's are'} excluded; this forecast includes checking and savings only.` : ''}
          {unmappedTransactionCount ? ` Across all bank history, ${unmappedTransactionCount} transaction${unmappedTransactionCount === 1 ? ' is' : 's are'} not linked to one unique Brevity account and ${unmappedTransactionCount === 1 ? 'is' : 'are'} excluded from this forecast.` : ''}
          {` The balance anchor uses ${balanceSource}.`}
          {todayPlanUnresolved ? ` Today’s balance value is ${balanceVerifiedLive ? 'a live intraday bank snapshot' : 'the latest stored cash anchor, not a verified live bank reading'}. Because Brevity cannot yet prove which scheduled items have cleared, today’s plan is not automatically reapplied; future balances carry that uncertainty.` : ''}
        </span>
      </section>
      {(error || freshnessMessage || balanceMessage || unmappedTransactionCount > 0) && (
        <div
          className={`finance-calendar-source-status${warning ? ' finance-calendar-source-status--warning' : ''}`}
          role={warning ? 'alert' : 'status'}
        >
          {balanceMessage && <span><strong>Balance anchor status:</strong> {balanceMessage}</span>}
          {(error || freshnessMessage) && <span><strong>Transaction snapshot status:</strong> {error || freshnessMessage} Bank activity below uses this exact-account snapshot; reconstructed closes appear only when every included cash account has a verified live ledger anchor and this transaction snapshot is fresh.</span>}
          {unmappedTransactionCount > 0 && <span><strong>Excluded bank activity:</strong> Review unlinked rows in Finance › Transactions with all accounts selected.</span>}
        </div>
      )}
    </>
  )
}

export default function CashForecastAgenda({
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
  const agendaRef = useRef(null)
  const pendingDetailFocusRef = useRef(false)
  const detailId = `cash-forecast-day-detail-${useId().replace(/:/g, '')}`
  const days = cells
    .filter(cell => cell.cur)
    .map(cell => {
      const key = `${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`
      const point = projection.get(key)
      const planned = point?.txns || []
      const bank = showBankActivity && key <= todayKey ? (actualsByDate?.[key] || []) : []
      const postedBank = bank.filter(transaction => !transaction?.pending)
      const pendingBank = bank.filter(transaction => transaction?.pending)
      const reconstructedBalance = key <= todayKey ? historicalBalances[key] : undefined
      return {
        key,
        planned,
        bank,
        plannedNet:Number(point?.delta || 0),
        bankNet:bankBalanceMovement(postedBank),
        pendingNet:bankBalanceMovement(pendingBank),
        postedBankCount:postedBank.length,
        pendingBankCount:pendingBank.length,
        balance:reconstructedBalance !== undefined ? reconstructedBalance : point?.bal,
        balanceIsReconstructed:reconstructedBalance !== undefined,
      }
    })
    .filter(day => day.key === todayKey || day.key === selectedDay || day.planned.length > 0 || day.bank.length > 0)

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
      {days.length > 0 ? days.map(day => {
        const plannedPreview = day.planned.map(transactionDescription).filter(Boolean).slice(0, 2)
        const bankPreview = day.bank.map(transaction => {
          const label = transactionDescription(transaction)
          const tags = [transaction?.pending ? 'Pending' : 'Posted', isTransferTransaction(transaction) ? 'Transfer' : ''].filter(Boolean)
          return label ? `${tags.join(' · ')} · ${label}` : ''
        }).filter(Boolean).slice(0, 2)
        const selected = day.key === selectedDay
        const dateLabel = new Date(`${day.key}T12:00:00`).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
        const plannedNetLabel = `${day.plannedNet >= 0 ? 'plus' : 'minus'} ${fmtMoney(Math.abs(day.plannedNet))}`
        const balanceKind = day.balanceIsReconstructed
          ? 'Reconstructed posted close'
          : day.key < todayKey
            ? 'Estimated historical cash balance'
            : day.key === todayKey
              ? balanceVerifiedLive ? 'Current bank liquidity' : 'Latest stored cash balance'
              : todayPlanUnresolved
                ? 'Projected balance with today unresolved'
                : 'Projected cash balance'
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
              <small>{day.planned.length} planned item{day.planned.length === 1 ? '' : 's'}{showBankActivity ? ` · ${day.bank.length} bank transaction${day.bank.length === 1 ? '' : 's'}` : ''}</small>
            </span>
            {day.balance !== undefined && (
              <span className="finance-calendar-agenda-values" title={`Balance anchor: ${balanceSource}`}>
                <small>{day.balanceIsReconstructed ? 'Reconstructed posted close' : day.key < todayKey ? 'Estimated historical cash balance' : day.key === todayKey ? balanceVerifiedLive ? 'Current bank liquidity' : 'Latest stored cash balance' : todayPlanUnresolved ? 'Projected balance · today unresolved' : 'Projected cash balance'}</small>
                <strong>{fmtMoney(day.balance)}</strong>
              </span>
            )}
            <span className="finance-calendar-agenda-activity">
              {day.planned.length > 0 && (
                <span className="finance-calendar-agenda-group finance-calendar-agenda-group--planned">
                  <span className="finance-calendar-agenda-group-heading">
                    <small>Planned activity</small>
                    <strong>Net {day.plannedNet >= 0 ? '+' : '−'}{fmtMoney(Math.abs(day.plannedNet))}</strong>
                  </span>
                  <span className="finance-calendar-agenda-preview">
                    {plannedPreview.map((label, index) => <small key={`${label}-${index}`}>{label}</small>)}
                    {day.planned.length > plannedPreview.length && <small>+{day.planned.length - plannedPreview.length} more planned</small>}
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
            </span>
          </button>
        )
      }) : (
        <div className="finance-calendar-agenda-empty">No planned or bank activity for this month.</div>
      )}
    </div>
  )
}
