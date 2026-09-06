import { useMemo } from 'react'
import { fmtMoney } from './projection.js'
import { reconcileFinanceDay, reconciliationStateLabel } from './reconciliation.js'

const stateColor = state => state === 'matched' ? '#7DCBA4' : state === 'missing-actual' || state === 'unplanned-actual' ? '#E8967A' : '#C5A46D'
const recordName = row => row.expected?.name || row.actual?.merchant_name || row.actual?.name || 'Transaction'

export default function FinanceReconciliation({ scheduled, actuals, date, actualsAvailable, onOpenActual, onOpenScheduled }) {
  const result = useMemo(() => reconcileFinanceDay({ scheduled, actuals, date }), [scheduled, actuals, date])
  const visibleRows = [...result.needsReview, ...result.rows.filter(row => row.state === 'matched')].slice(0, 6)

  const open = row => {
    if (row.actual?.id) return onOpenActual?.({ ids:[row.actual.id], label:`Reconciliation · ${recordName(row)}` })
    if (row.candidates?.length) return onOpenActual?.({ ids:row.candidates.map(candidate => candidate.id), label:`Possible matches · ${recordName(row)}` })
    if (row.expected?.id) return onOpenScheduled?.({ ids:[row.expected.id], label:`Expected transaction · ${recordName(row)}` })
  }

  return <section className="dash-card" aria-label="Daily financial reconciliation" style={{ margin:'0 28px 16px', padding:'18px 20px' }}>
    <header style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:14 }}>
      <div>
        <span style={{ color:'var(--gold)', fontSize:10, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase' }}>Daily reconciliation</span>
        <h2 style={{ margin:'4px 0 3px', fontFamily:'var(--font-serif)', fontSize:22, fontWeight:500 }}>
          {actualsAvailable ? result.allClear ? 'Expected and posted activity agree' : `${result.needsReview.length} item${result.needsReview.length === 1 ? '' : 's'} need review` : 'Posted activity is not available'}
        </h2>
        <p style={{ margin:0, color:'var(--muted)', fontSize:11 }}>Expected occurrences for today matched against posted activity within four days. No records are changed automatically.</p>
      </div>
      {actualsAvailable && <div style={{ textAlign:'right', flexShrink:0 }}>
        <strong style={{ display:'block', color:result.varianceTotal > 0 ? '#E8967A' : result.varianceTotal < 0 ? '#7DCBA4' : 'var(--soft-white)', fontSize:18 }}>{result.varianceTotal > 0 ? '+' : ''}{fmtMoney(result.varianceTotal)}</strong>
        <small style={{ color:'var(--muted)' }}>net amount variance</small>
      </div>}
    </header>

    {!actualsAvailable ? <p style={{ margin:0, padding:'12px 14px', borderRadius:10, background:'rgba(255,255,255,.035)', color:'var(--muted)', fontSize:12 }}>Sync a financial account to compare the plan with posted transactions.</p>
      : visibleRows.length === 0 ? <p style={{ margin:0, padding:'12px 14px', borderRadius:10, background:'rgba(125,203,164,.06)', color:'#7DCBA4', fontSize:12 }}>No expected or unplanned posted transactions require attention today.</p>
      : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:8 }}>
        {visibleRows.map((row, index) => {
          const planned = Number(row.expected?.expectedAmount || 0), posted = Math.abs(Number(row.actual?.amount || 0))
          const canOpen = Boolean(row.actual?.id || row.expected?.id || row.candidates?.length)
          return <button key={`${row.state}-${row.expected?.occurrenceId || row.actual?.id || index}`} type="button" onClick={() => open(row)} disabled={!canOpen}
            style={{ display:'block', textAlign:'left', padding:'11px 12px', borderRadius:10, border:'1px solid rgba(255,255,255,.08)', background:'rgba(255,255,255,.025)', color:'inherit', cursor:canOpen ? 'pointer' : 'default', fontFamily:'inherit' }}>
            <span style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
              <strong style={{ fontSize:12 }}>{recordName(row)}</strong>
              <small style={{ color:stateColor(row.state), whiteSpace:'nowrap' }}>{reconciliationStateLabel(row.state)}</small>
            </span>
            <span style={{ display:'block', marginTop:5, color:'var(--muted)', fontSize:10 }}>
              {row.state === 'ambiguous' ? `${row.candidates.length} plausible posted matches · review required`
                : row.state === 'missing-actual' ? `Expected ${fmtMoney(planned)} today · no confident posted match`
                : row.state === 'unplanned-actual' ? `Posted ${fmtMoney(posted)} today · not found in the plan`
                : `Expected ${fmtMoney(planned)} · posted ${fmtMoney(posted)}${row.timingVariance ? ` · ${row.timingVariance} day timing difference` : ''} · ${row.confidence} confidence`}
            </span>
          </button>
        })}
      </div>}
  </section>
}
