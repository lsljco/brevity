import FinanceExport from './FinanceExport.jsx'
import {financeReport} from './financeExportData.js'
import './AutoReconciliationReport.css'
import BankBalanceReconciliation from './BankBalanceReconciliation.jsx'
import {buildUniquePlaidAccountMap} from './calendarSemantics.js'
import {useMemo,useState} from 'react'
import {RECONCILIATION_BATCH_LIMIT} from './autoReconciliation.js'
import {fmtMoney} from './projection.js'
import {exceptionSignature,readExceptionDismissals,dismissException,canAcceptMatch,buildExceptionMatchReport} from './exceptionDecisions.js'

export default function AutoReconciliationReport({scheduled,actuals,accounts,accountIds,readOnly,onReview,onOpenPlanned,freshnessMessage,compact=false}){
 const report=useMemo(()=>{
  const assessed=buildExceptionMatchReport({scheduled,actuals,accounts})
  if(!accountIds)return assessed
  const map=buildUniquePlaidAccountMap(accounts)
  return {...assessed,suggestions:assessed.suggestions.filter(r=>accountIds.has(r.plan.acct)),ambiguous:assessed.ambiguous.filter(r=>accountIds.has(r.plan.acct)),unresolved:assessed.unresolved.filter(a=>accountIds.has(map[a.accountId]))}
 },[scheduled,actuals,accounts,accountIds])
 const [selectedIds,setSelectedIds]=useState(new Set()),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[visibleCount,setVisibleCount]=useState(20)
 const [dismissed,setDismissed]=useState(()=>readExceptionDismissals(localStorage)),[showDismissed,setShowDismissed]=useState(false)
 const isDismissed=row=>dismissed.includes(exceptionSignature('match',row))
 const visible=report.suggestions.filter(row=>showDismissed||!isDismissed(row))
 const selected=report.suggestions.filter(row=>selectedIds.has(row.id)&&!isDismissed(row)&&canAcceptMatch(row)).slice(0,RECONCILIATION_BATCH_LIMIT)
 const ambiguous=[...new Map(report.ambiguous.map(row=>[row.actual.id,row.actual])).values()]
 const prepare=async rows=>{setBusy(true);setMessage('');try{if(!onReview)throw Error('Financial review is unavailable. Reopen Finance and try again.');if(await onReview(rows))setMessage('Review the exact changes and approve in Action Mode.')}catch(error){setMessage(error.code==='VERSION_CONFLICT'||error.status===409?'Records changed. Refresh this review before accepting; nothing was applied.':error.message||'Unable to prepare these changes.')}finally{setBusy(false)}}
 const dismiss=row=>{setDismissed(previous=>dismissException(localStorage,previous,exceptionSignature('match',row)));setSelectedIds(previous=>{const next=new Set(previous);next.delete(row.id);return next})}
 return <section className={compact?'match-transaction-decisions':'dash-card'} aria-label="Automatic reconciliation recommendations" style={compact?undefined:{margin:'0 0 16px',padding:20}}>
  {!compact&&<><FinanceExport report={financeReport('Bank reconciliation recommendations',report,[freshnessMessage,'Recommendations are not approved reconciliations.'])}/><BankBalanceReconciliation compact accounts={accounts.filter(a=>!accountIds||accountIds.has(a.id))}/></>}
  <h2>Transaction matches</h2><p>{visible.length} suggestions · {ambiguous.length} need closer review · {report.unresolved.length} without a supported match</p>
  <p className="match-review-note">Accept opens a review before changing an occurrence. Bank balances and future recurring items stay unchanged. Pending transactions are excluded.</p>
  {freshnessMessage&&<details><summary>Bank activity status</summary><p>{freshnessMessage}</p></details>}
  <label className="match-dismissed-toggle"><input type="checkbox" checked={showDismissed} onChange={e=>setShowDismissed(e.target.checked)}/> Show dismissed transaction suggestions</label>
  {!visible.length&&<p>No supported changes are ready. You can still inspect the unmatched transactions below.</p>}
  {!readOnly&&visible.some(canAcceptMatch)&&<div className="match-review-actions"><button disabled={busy} onClick={()=>setSelectedIds(new Set(visible.filter(row=>!isDismissed(row)&&row.amountVariance===0).slice(0,RECONCILIATION_BATCH_LIMIT).map(row=>row.id)))}>Select up to {RECONCILIATION_BATCH_LIMIT} exact matches</button><button disabled={busy} onClick={()=>setSelectedIds(new Set())}>Clear selection</button><span>{selected.length} selected</span></div>}
  <div className="match-proposals">{visible.slice(0,visibleCount).map(row=><article key={row.id} className="reconciliation-choice">
   <input type="checkbox" aria-label={`Review match for ${row.plan.name} on ${row.occurrenceDate}`} checked={selectedIds.has(row.id)&&!isDismissed(row)} disabled={readOnly||busy||isDismissed(row)||!canAcceptMatch(row)||(!selectedIds.has(row.id)&&selected.length>=RECONCILIATION_BATCH_LIMIT)} onChange={e=>setSelectedIds(previous=>{const next=new Set(previous);e.target.checked?next.add(row.id):next.delete(row.id);return next})}/>
   <div><strong>{row.plan.name}</strong>{isDismissed(row)&&<small> · Dismissed</small>}<p>{accounts.find(a=>a.id===row.plan.acct)?.name||'Linked account'}</p>
    <dl className="match-evidence"><dt>Planned</dt><dd>{row.occurrenceDate} · {fmtMoney(Number(row.plan.amount))}</dd><dt>Bank posted</dt><dd>{row.actual.date} · {fmtMoney(Math.abs(Number(row.actual.amount)))}</dd></dl><p>{row.actual.name}</p>
    {!canAcceptMatch(row)?<p><strong>Payment is {fmtMoney(-row.amountVariance)} below the planned amount.</strong> Keep that remainder open unless you verify the full bill is settled. This suggestion cannot mark the whole bill paid.</p>:<p>{row.occurrenceDate===row.actual.date?'Link this occurrence to the posted bank record.':`Move this occurrence to ${row.actual.date} and link the posted bank record.`} {row.amountVariance!==0&&`Amount difference: ${fmtMoney(row.amountVariance)}.`}</p>}
    <details><summary>Why this suggestion?</summary><p>{row.reason}</p><p>{row.actual.originalStatement||row.actual.name}</p></details>
    {!readOnly&&<div className="match-review-actions">{canAcceptMatch(row)?<button disabled={busy} onClick={()=>prepare([row])} aria-label={`Accept match for ${row.plan.name} on ${row.occurrenceDate}`}>Accept match</button>:onOpenPlanned&&<button onClick={()=>onOpenPlanned(row.plan,row.occurrenceDate)}>Edit planned payment</button>}<button disabled={busy} onClick={()=>dismiss(row)} aria-label={`Dismiss match for ${row.plan.name} on ${row.occurrenceDate}`}>Dismiss</button></div>}
   </div>
  </article>)}</div>
  {visible.length>visibleCount&&<button onClick={()=>setVisibleCount(n=>n+20)}>Show more suggestions</button>}
  {!readOnly&&selected.length>0&&<button className="match-batch-accept" disabled={busy} onClick={()=>prepare(selected)}>Accept {selected.length} selected matches</button>}
  {ambiguous.length>0&&<details><summary>Review ambiguous transactions ({ambiguous.length})</summary>{ambiguous.slice(0,visibleCount).map(actual=><article key={actual.id}><strong>{actual.name}</strong><p>{actual.date} · {fmtMoney(Math.abs(Number(actual.amount)))}</p><p>More than one possible match. Compare the planned items before changing one.</p>{report.ambiguous.filter(row=>row.actual.id===actual.id).map(row=><p key={row.id}>{row.plan.name} · {row.occurrenceDate} · {fmtMoney(Number(row.plan.amount))} {onOpenPlanned&&!readOnly&&<button onClick={()=>onOpenPlanned(row.plan,row.occurrenceDate)}>Review planned item</button>}</p>)}</article>)}{ambiguous.length>visibleCount&&<button onClick={()=>setVisibleCount(n=>n+20)}>Show more ambiguous transactions</button>}</details>}
  {report.unresolved.length>0&&<details><summary>Transactions without a supported match ({report.unresolved.length})</summary>{report.unresolved.slice(0,visibleCount).map(actual=><article key={actual.id}><strong>{actual.name||'Bank transaction'}</strong><p>{actual.date} · {fmtMoney(Math.abs(Number(actual.amount)))}</p><details><summary>Bank description</summary><p>{actual.originalStatement||actual.name}</p></details></article>)}{report.unresolved.length>visibleCount&&<button onClick={()=>setVisibleCount(n=>n+20)}>Show more unmatched transactions</button>}</details>}
  {message&&<p role="status" className="reconciliation-message">{message}</p>}
 </section>
}
