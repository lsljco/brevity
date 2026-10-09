import { fmtMoney } from './projection.js'

export default function CashForecastBalances({ point, live }) {
  if (point?.currentBalance === undefined) return null
  const signed = value => `${value >= 0 ? '+' : '−'}${fmtMoney(Math.abs(value))}`
  return <section className="finance-card" aria-label="Current and projected cash" style={{ marginBottom:16 }}>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:16 }}>
      <div><p>{live ? 'Current bank balance' : 'Last saved bank balance'}</p><strong>{fmtMoney(point.currentBalance)}</strong></div>
      <div><p>Pending bank activity</p><strong>{signed(point.pendingDelta)}</strong></div>
      <div><p>Remaining scheduled today</p><strong>{signed(point.remainingDelta)}</strong></div>
      <div><p>Projected after today’s activity</p><strong>{fmtMoney(point.bal)}</strong></div>
    </div>
    <p>Posted activity is already in the bank balance. Pending activity and unmatched scheduled items adjust the projection once. Scheduled items remain estimates until matched to bank activity.</p>
    {!point.ledgerComplete && <p role="status">A posted balance is unavailable for some accounts. Their stored balance may include holds; additional pending adjustments for those accounts are excluded to avoid counting holds twice.</p>}
    <details><summary>What is included in today’s projection?</summary>
      <p>Pending bank activity includes outstanding authorizations from earlier days. Older unmatched scheduled items need review; they are not automatically treated as unpaid debt. An exact, unique account, vendor or name, amount, and nearby date match identifies posted or pending activity. Ambiguous matches remain scheduled estimates.</p>
      <ul>{point.realization.map(row => <li key={row.id}>{row.name}: {row.statuses.map(status => status.status === 'expected' ? 'not matched — included in projection' : status.status === 'posted' ? 'posted — already in bank balance' : 'pending — counted once').join('; ')}{row.delta !== 0 ? ` (${signed(row.delta)})` : ''}</li>)}</ul>
    </details>
  </section>
}
