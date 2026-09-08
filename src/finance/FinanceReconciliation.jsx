import { useMemo, useState } from 'react'
import { fmtMoney } from './projection.js'
import { reconcileFinanceDay, reconciliationDrilldownTarget, reconciliationStateLabel } from './reconciliation.js'

const stateColor = state => state === 'matched' ? '#7DCBA4' : state === 'missing-actual' || state === 'unplanned-actual' ? '#E8967A' : '#C5A46D'
const recordName = row => row.expected?.name || row.actual?.merchant_name || row.actual?.name || 'Transaction'
const activitySummary = totals => {
  const parts = []
  if (totals.income) parts.push(`${fmtMoney(totals.income)} in`)
  if (totals.otherInflows) parts.push(`${fmtMoney(totals.otherInflows)} other cash in`)
  if (totals.expense) parts.push(`${fmtMoney(totals.expense)} out`)
  return parts.join(' · ') || fmtMoney(0)
}
const signedMoney = amount => `${amount > 0 ? '+' : ''}${fmtMoney(amount)}`
const possibleMatchCount = row => row.candidates?.length || row.expectedCandidates?.length || 0

export default function FinanceReconciliation({ scheduled, actuals, date, actualsAvailable, onOpenActual, onOpenScheduled }) {
  const result = useMemo(() => reconcileFinanceDay({ scheduled, actuals, date }), [scheduled, actuals, date])
  const [showAll, setShowAll] = useState(false)
  const orderedRows = [...result.needsReview, ...result.rows.filter(row => row.state === 'matched')]
  const visibleRows = showAll ? orderedRows : orderedRows.slice(0, 6)
  const hiddenCount = orderedRows.length - visibleRows.length

  const open = row => {
    const target = reconciliationDrilldownTarget(row)
    if (!target) return
    const label = target.type === 'scheduled' ? `Expected transaction · ${recordName(row)}` : row.candidates?.length ? `Possible matches · ${recordName(row)}` : `Reconciliation · ${recordName(row)}`
    if (target.type === 'scheduled') return onOpenScheduled?.({ ...target.filter, label })
    return onOpenActual?.({ ...target.filter, label })
  }

  return <section className="dash-card finance-reconciliation" aria-label="Daily financial reconciliation" style={{ margin:'0 28px 16px', padding:'18px 20px' }}>
    <header style={{ marginBottom:14 }}>
      <div>
        <span style={{ color:'var(--gold)', fontSize:10, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase' }}>Daily reconciliation</span>
        <h2 style={{ margin:'4px 0 3px', fontFamily:'var(--font-serif)', fontSize:22, fontWeight:500 }}>
          {actualsAvailable ? result.allClear ? 'Expected and bank activity agree' : `${result.needsReview.length} item${result.needsReview.length === 1 ? '' : 's'} need review` : 'Bank activity is not available'}
        </h2>
        <p style={{ margin:0, color:'var(--muted)', fontSize:11 }}>Expected occurrences for today matched against posted and pending bank activity within four days. No records are changed automatically.</p>
        {actualsAvailable && <p style={{ margin:'5px 0 0', color:'var(--muted)', fontSize:10 }}>{result.matched} matched · {result.needsReview.length} need review{result.counts.ambiguous ? ` · ${result.counts.ambiguous} possible-match set${result.counts.ambiguous === 1 ? '' : 's'}` : ''} · {result.rows.length} total</p>}
      </div>
    </header>

    {actualsAvailable && <div aria-label="Reconciliation totals" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))', gap:8, marginBottom:14 }}>
      <div style={{ padding:'9px 11px', borderRadius:10, background:'rgba(255,255,255,.025)', border:'1px solid rgba(255,255,255,.06)' }}>
        <strong style={{ display:'block', color:result.matchedDifference.netCash > 0 ? '#7DCBA4' : result.matchedDifference.netCash < 0 ? '#E8967A' : 'var(--soft-white)', fontSize:15 }}>{signedMoney(result.matchedDifference.netCash)}</strong>
        <small style={{ display:'block', color:'var(--muted)' }}>matched net cash difference</small>
        <small style={{ display:'block', marginTop:2, color:'var(--muted)' }}>Income {signedMoney(result.matchedDifference.income)} · Expenses {signedMoney(result.matchedDifference.expense)} vs expected</small>
      </div>
      <div style={{ padding:'9px 11px', borderRadius:10, background:'rgba(232,150,122,.045)', border:'1px solid rgba(232,150,122,.12)' }}>
        <strong style={{ display:'block', color:result.expectedNotPosted.total ? '#E8967A' : 'var(--soft-white)', fontSize:15 }}>{activitySummary(result.expectedNotPosted)}</strong>
        <small style={{ color:'var(--muted)' }}>expected, not found</small>
      </div>
      <div style={{ padding:'9px 11px', borderRadius:10, background:'rgba(232,150,122,.045)', border:'1px solid rgba(232,150,122,.12)' }}>
        <strong style={{ display:'block', color:result.unplannedPosted.total ? '#E8967A' : 'var(--soft-white)', fontSize:15 }}>{activitySummary(result.unplannedPosted)}</strong>
        <small style={{ color:'var(--muted)' }}>unplanned bank activity</small>
      </div>
      {Boolean(result.counts.ambiguous) && <div style={{ padding:'9px 11px', borderRadius:10, background:'rgba(197,164,109,.045)', border:'1px solid rgba(197,164,109,.14)' }}>
        <strong style={{ display:'block', color:'var(--gold)', fontSize:15 }}>{result.counts.ambiguous}</strong>
        <small style={{ display:'block', color:'var(--muted)' }}>possible-match {result.counts.ambiguous === 1 ? 'set' : 'sets'}</small>
        <small style={{ display:'block', marginTop:2, color:'var(--muted)' }}>Excluded from totals until reviewed</small>
      </div>}
    </div>}

    {!actualsAvailable ? <p style={{ margin:0, padding:'12px 14px', borderRadius:10, background:'rgba(255,255,255,.035)', color:'var(--muted)', fontSize:12 }}>Sync a financial account to compare the plan with posted and pending bank activity.</p>
      : visibleRows.length === 0 ? <p style={{ margin:0, padding:'12px 14px', borderRadius:10, background:'rgba(125,203,164,.06)', color:'#7DCBA4', fontSize:12 }}>No expected or unplanned bank activity requires attention today.</p>
      : <div className="finance-reconciliation-rows" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:8 }}>
        {visibleRows.map((row, index) => {
          const planned = Number(row.expected?.expectedAmount || 0), posted = Math.abs(Number(row.actual?.amount || 0))
          const canOpen = Boolean(reconciliationDrilldownTarget(row))
          return <button key={`${row.state}-${row.expected?.occurrenceId || row.actual?.id || index}`} type="button" onClick={() => open(row)} disabled={!canOpen}
            style={{ display:'block', textAlign:'left', padding:'11px 12px', borderRadius:10, border:'1px solid rgba(255,255,255,.08)', background:'rgba(255,255,255,.025)', color:'inherit', cursor:canOpen ? 'pointer' : 'default', fontFamily:'inherit' }}>
            <span style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
              <strong style={{ fontSize:12 }}>{recordName(row)}</strong>
              <small style={{ color:stateColor(row.state), whiteSpace:'nowrap' }}>{reconciliationStateLabel(row.state)}</small>
            </span>
            <span style={{ display:'block', marginTop:5, color:'var(--muted)', fontSize:10 }}>
              {row.state === 'ambiguous' ? `${possibleMatchCount(row)} plausible ${row.expectedCandidates?.length ? 'planned matches' : 'bank matches'} · review required`
                : row.state === 'missing-actual' ? `Expected ${fmtMoney(planned)} today · no confident bank match`
                : row.state === 'unplanned-actual' ? `${row.actualKind === 'other-inflow' ? 'Other cash inflow' : 'Bank activity'} ${fmtMoney(posted)} today · not found in the plan`
                : `Expected ${fmtMoney(planned)} · bank activity ${fmtMoney(posted)}${row.realizationStatus === 'pending' ? ' · pending, not yet realized' : ''}${row.timingVariance ? ` · ${row.timingVariance} day timing difference` : ''} · ${row.confidence} confidence`}
            </span>
          </button>
        })}
      </div>}
    {actualsAvailable && orderedRows.length > 6 && <button type="button" onClick={() => setShowAll(value => !value)} aria-expanded={showAll}
      style={{ marginTop:10, border:'1px solid rgba(197,164,109,.24)', background:'rgba(197,164,109,.06)', color:'var(--gold)', borderRadius:9, padding:'7px 11px', cursor:'pointer', fontFamily:'inherit', fontSize:11 }}>
      {showAll ? 'Show fewer reconciliation items' : `Show all ${orderedRows.length} reconciliation items (${hiddenCount} more)`}
    </button>}
  </section>
}
