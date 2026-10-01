import './AutoReconciliationReport.css'
import { buildUniquePlaidAccountMap } from './calendarSemantics.js'
import { useMemo, useState } from 'react'
import { buildAutoReconciliationReport, RECONCILIATION_BATCH_LIMIT } from './autoReconciliation.js'
import { fmtMoney } from './projection.js'

export default function AutoReconciliationReport({ scheduled, actuals, accounts, accountIds, readOnly, onReview, freshnessMessage }) {
  const report=useMemo(()=>{
    const assessed=buildAutoReconciliationReport({scheduled,actuals,accounts})
    if (!accountIds) return assessed
    const accountMap=buildUniquePlaidAccountMap(accounts)
    return {...assessed,suggestions:assessed.suggestions.filter(row=>accountIds.has(row.plan.acct)),ambiguous:assessed.ambiguous.filter(row=>accountIds.has(row.plan.acct)),unresolved:assessed.unresolved.filter(actual=>accountIds.has(accountMap[actual.accountId]))}
  },[scheduled,actuals,accounts,accountIds])
  const [excluded,setExcluded]=useState(new Set()),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const selected=report.suggestions.filter(row=>!excluded.has(row.id)).slice(0,RECONCILIATION_BATCH_LIMIT)
  const ambiguousCount=new Set(report.ambiguous.map(row=>row.actual.id)).size
  return <section className="dash-card" aria-label="Automatic reconciliation recommendations" style={{margin:'0 0 16px',padding:20}}>
    <h2 style={{margin:'0 0 8px',fontSize:20}}>Reconciliation recommendations</h2>
    <p style={{fontSize:12,color:'var(--muted)'}}>Brevity analyzes the last 30 days of posted expenses across your selected linked accounts against your plan. Nothing changes until you approve the recommended matches in Action Mode.</p>
    <p style={{fontSize:12}}>{report.suggestions.length} suggested matches · {ambiguousCount} ambiguous charges · {report.unresolved.length} other charges without a confident match</p>
    {freshnessMessage && <p style={{fontSize:11,color:'var(--muted)'}}>{freshnessMessage}</p>}
    {!report.suggestions.length && <p>No unique matches are ready for approval. Pending charges are excluded.</p>}
    <div style={{display:'grid',gap:10}}>{report.suggestions.map(row=><label key={row.id} className="reconciliation-choice">
      <input type="checkbox" aria-label={`Review match for ${row.plan.name} on ${row.occurrenceDate}`} checked={!excluded.has(row.id)} disabled={readOnly||busy} onChange={event=>setExcluded(previous=>{const next=new Set(previous);event.target.checked?next.delete(row.id):next.add(row.id);return next})}/>
      <span><strong>{row.plan.name}</strong><br/>
        Account: {accounts.find(account=>account.id===row.plan.acct)?.name || 'Linked account'}<br/>
        Projected: {row.occurrenceDate} · {fmtMoney(Number(row.plan.amount))}<br/>
        Posted: {row.actual.date} · {fmtMoney(Number(row.actual.amount))} · {row.actual.name}<br/>
        Difference: {fmtMoney(row.amountVariance)}<br/>
        <span style={{color:'var(--muted)'}}>{row.reason}<br/>Recommendation: {row.occurrenceDate===row.actual.date?'link this occurrence to its bank charge':`move this occurrence to ${row.actual.date} and link its bank charge`}. Keep the original budget amount and future recurrence.</span>
      </span>
    </label>)}</div>
    {ambiguousCount>0 && <details style={{marginTop:12}}><summary>Review ambiguous charges</summary>{[...new Map(report.ambiguous.map(row=>[row.actual.id,row.actual])).values()].map(actual=><p key={actual.id} style={{fontSize:12}}>{actual.name} · {actual.date} · {fmtMoney(actual.amount)} — more than one possible match; no automatic recommendation.</p>)}</details>}
    {!readOnly && <button type="button" disabled={!selected.length||busy} onClick={async()=>{setBusy(true);setMessage('');try{if(await onReview(selected))setMessage('Report prepared. Review the exact changes and approve in Action Mode.')}catch(error){setMessage(error.code==='VERSION_CONFLICT'||error.status===409?'Household records changed while this review was being prepared. Select Review again to load the latest recommendations and prepare a new review. Nothing was applied.':error.message||'Unable to prepare the report.')}finally{setBusy(false)}}} style={{marginTop:12}}>{busy?'Preparing report…':`Review ${selected.length} recommended matches`}</button>}
    {report.suggestions.length>RECONCILIATION_BATCH_LIMIT && <p style={{fontSize:11}}>Review up to {RECONCILIATION_BATCH_LIMIT} matches at a time. Remaining recommendations stay available.</p>}
    {message && <p role="status" className="reconciliation-message">{message}</p>}
    <p style={{fontSize:11,color:'var(--muted)'}}>Matching window: 7 days either side of posting; amount difference up to 2%, capped at $25, with a $2 minimum tolerance. Recommendations are suggestions, not proof of payment. Approved links retain both source records and can be undone in Action Mode.</p>
  </section>
}
