import { fmtMoney } from './projection.js'

export default function CashForecastBalances({ point, live }) {
  if (point?.currentBalance === undefined) return null
  const planned = point.mode === 'planned'
  const signed = value => `${value >= 0 ? '+' : '−'}${fmtMoney(Math.abs(value))}`
  return <section className="finance-card" aria-label="Current and projected cash" style={{ marginBottom:16 }}>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:16 }}>
      <div><p>{planned ? 'Prior day’s ending balance' : live ? 'Current bank balance' : 'Last saved bank balance'}</p><strong>{fmtMoney(planned ? point.openingBalance : point.currentBalance)}</strong></div>
      <div><p>{planned ? 'Pending excluded from plan' : 'Pending bank activity'}</p><strong>{signed(point.pendingDelta)}</strong></div>
      <div><p>{planned ? 'Planned activity today' : 'Remaining scheduled today'}</p><strong>{signed(point.remainingDelta)}</strong></div>
      <div><p>Projected after today’s activity</p><strong>{fmtMoney(point.bal)}</strong></div>
    </div>
    {point.openingSource !== 'verified-close' && planned && <p role="status">Estimated opening balance for {point.openingDate}: {point.openingSource === 'reconstructed-close' ? 'reconstructed from the latest bank balance and posted history' : 'derived from stored balances and available posted activity'}. A verified end-of-day bank balance is not available.</p>}
    {point.overdue?.length > 0 && <p>Earlier scheduled activity settling now: {signed(point.overdueDelta)}. Included once in today’s plan.</p>}
    {point.unresolvedPastCount > 0 && <p>{point.unresolvedPastCount} earlier scheduled items have no confirmed bank match. Excluded from today’s projection; review and reschedule any still outstanding.</p>}
    <p>{planned ? 'Prior day’s ending balance plus today’s planned income minus planned expenses. Future days carry the preceding forecast forward. Turn on Reconcile with bank to use the latest bank snapshot and remaining activity.' : 'Posted activity is already in the bank balance. Pending activity and unmatched scheduled items adjust the projection once.'}</p>
    {!point.ledgerComplete && <p role="status">A posted balance is unavailable for some accounts. Their stored balance may include holds; additional pending adjustments for those accounts are excluded to avoid counting holds twice.</p>}
    <details><summary>What is included in today’s projection?</summary>
      <p>Pending bank activity includes authorizations from earlier days. A missing match does not prove an earlier planned item is unpaid. Unique account and vendor or name matches reconcile same-day activity, including amount changes; nearby-date matches also require the same amount. Ambiguous matches remain unresolved.</p>
      <ul>{point.overdue?.map(row => <li key={row.id}>{row.date} · {row.name}: pending or posted today ({signed(row.delta)})</li>)}{point.realization.map(row => <li key={row.id}>{row.name}: {row.statuses.map(status => planned ? 'planned amount included' : status.status === 'expected' ? 'not matched — included in projection' : status.status === 'posted' ? 'posted — already in bank balance' : 'pending — counted once').join('; ')}{row.delta !== 0 ? ` (${signed(row.delta)})` : ''}</li>)}</ul>
    </details>
  </section>
}
