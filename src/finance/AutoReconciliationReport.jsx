import FinanceExport from './FinanceExport.jsx'
import {financeReport} from './financeExportData.js'
import './AutoReconciliationReport.css'
import BankBalanceReconciliation from './BankBalanceReconciliation.jsx'
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
  const [selectedIds,setSelectedIds]=useState(new Set()),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[visibleCount,setVisibleCount]=useState(20)
  const selected=report.suggestions.filter(row=>selectedIds.has(row.id)).slice(0,RECONCILIATION_BATCH_LIMIT)
  const ambiguousCount=new Set(report.ambiguous.map(row=>row.actual.id)).size
  return <section className="dash-card" aria-label="Automatic reconciliation recommendations" style={{margin:'0 0 16px',padding:20}}>
<FinanceExport report={financeReport('Bank reconciliation recommendations',report,[freshnessMessage,'Recommendations are not approved reconciliations.'])}/>
    <BankBalanceReconciliation compact accounts={accounts.filter(account=>!accountIds || accountIds.has(account.id))}/>
    <h2 style={{margin:'18px 0 8px',fontSize:20}}>Review transactions</h2>
    <p style={{fontSize:12,color:'var(--muted)'}}>Review unclear matches before applying changes. Suggested matches connect expected bills and income to posted bank activity. Review the evidence and forecast effect before approving.</p>
    <p style={{fontSize:12}}>{report.suggestions.length} suggested matches · {ambiguousCount} ambiguous transactions · {report.unresolved.length} other transactions without a confident match</p>
    {freshnessMessage && <details><summary>Bank activity status</summary><p style={{fontSize:11,color:'var(--muted)'}}>{freshnessMessage}</p></details>}
    {!report.suggestions.length && <p>No unique matches are ready for approval. Pending transactions are excluded.</p>}
    {!readOnly&&report.suggestions.length>0&&<div className="match-review-actions"><button disabled={busy} onClick={()=>setSelectedIds(new Set(report.suggestions.filter(row=>row.amountVariance===0).slice(0,RECONCILIATION_BATCH_LIMIT).map(row=>row.id)))}>Select up to {RECONCILIATION_BATCH_LIMIT} exact matches</button><button disabled={busy} onClick={()=>setSelectedIds(new Set())}>Clear selection</button><span>{selected.length} in this review batch</span></div>}
    <div style={{display:'grid',gap:10}}>{report.suggestions.slice(0,visibleCount).map(row=><label key={row.id} className="reconciliation-choice">
      <input type="checkbox" aria-label={`Review match for ${row.plan.name} on ${row.occurrenceDate}`} checked={selectedIds.has(row.id)} disabled={readOnly||busy||(!selectedIds.has(row.id)&&selected.length>=RECONCILIATION_BATCH_LIMIT)} onChange={event=>setSelectedIds(previous=>{const next=new Set(previous);event.target.checked?next.add(row.id):next.delete(row.id);return next})}/>
      <span><strong>{row.plan.name}</strong><br/>
        Account: {accounts.find(account=>account.id===row.plan.acct)?.name || 'Linked account'}<br/>
        Projected: {row.occurrenceDate} · {fmtMoney(Number(row.plan.amount))}<br/>
        Posted: {row.actual.date} · {fmtMoney(Number(row.actual.amount))} · {row.actual.name}<br/>
        Difference: {fmtMoney(row.amountVariance)}<br/>
        Forecast effect: treat this occurrence as paid or received; keep the bank balance unchanged. {row.amountVariance!==0&&'The amount differs. Confirm this is the complete payment, not a partial payment.'}<br/>
        <span style={{color:'var(--muted)'}}>{row.reason}<br/>Recommendation: {row.occurrenceDate===row.actual.date?'link this occurrence to its bank transaction':`move this occurrence to ${row.actual.date} and link its bank transaction`}. Keep the original budget amount and future recurrence.</span>
      </span>
    </label>)}</div>
    {report.suggestions.length>visibleCount&&<button onClick={()=>setVisibleCount(count=>count+20)}>Show more suggested matches</button>}
    {ambiguousCount>0 && <details style={{marginTop:12}}><summary>Review ambiguous transactions</summary>{[...new Map(report.ambiguous.map(row=>[row.actual.id,row.actual])).values()].map(actual=><p key={actual.id} style={{fontSize:12}}>{actual.name} · {actual.date} · {fmtMoney(actual.amount)} — more than one possible match; no automatic recommendation.</p>)}</details>}
    {report.unresolved.length>0&&<details><summary>Transactions still needing a match ({report.unresolved.length})</summary>{report.unresolved.slice(0,visibleCount).map(actual=><p key={actual.id}>{actual.name||'Bank transaction'} · {actual.date} · {fmtMoney(actual.amount)}. No supported unique match in the reviewed period.</p>)}{report.unresolved.length>visibleCount&&<button onClick={()=>setVisibleCount(count=>count+20)}>Show more unmatched transactions</button>}</details>}
    {!readOnly && selected.length>0 && <button type="button" disabled={!selected.length||busy} onClick={async()=>{setBusy(true);setMessage('');try{if(await onReview(selected))setMessage('Report prepared. Review the exact changes and approve in Action Mode.')}catch(error){setMessage(error.code==='VERSION_CONFLICT'||error.status===409?'Household records changed while this review was being prepared. Select Review again to load the latest recommendations and prepare a new review. Nothing was applied.':error.message||'Unable to prepare the report.')}finally{setBusy(false)}}} style={{marginTop:12}}>{busy?'Preparing report…':`Review ${selected.length} recommended matches`}</button>}
    {report.suggestions.length>RECONCILIATION_BATCH_LIMIT && <p style={{fontSize:11}}>Review up to {RECONCILIATION_BATCH_LIMIT} matches at a time. Remaining recommendations stay available.</p>}
    {message && <p role="status" className="reconciliation-message">{message}</p>}
    <details><summary>Matching details</summary><p style={{fontSize:11,color:'var(--muted)'}}>Matching window: 7 days either side of posting; amount difference up to 2%, capped at $25, with a $2 minimum tolerance. Recommendations are suggestions, not proof of payment. Approved links retain both source records and can be undone in Action Mode.</p></details>
  </section>
}
