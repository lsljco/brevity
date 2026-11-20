import {useEffect,useMemo,useRef,useState} from 'react'
import {accountLinkGroups} from './accountLinkReview.js'
import {compatiblePlaidAccountType} from './financeRefresh.js'
import {fmtMoney} from './projection.js'
import AutoReconciliationReport from './AutoReconciliationReport.jsx'
import {exceptionSignature,readExceptionDismissals,dismissException,filterGroupTransactions} from './exceptionDecisions.js'
import './AutoReconciliationReport.css'

export default function AccountLinkReview({accounts,actuals,scheduled=[],sources=[],readOnly,onReview,onReviewMatches,onOpenAccounts,onLoadSources,onOpenPlanned}){
 const groups=useMemo(()=>accountLinkGroups(accounts,actuals,sources),[accounts,actuals,sources])
 const [active,setActive]=useState(null),[review,setReview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [query,setQuery]=useState(''),[status,setStatus]=useState('all'),[limit,setLimit]=useState(25),[choices,setChoices]=useState({})
 const [dismissed,setDismissed]=useState(()=>readExceptionDismissals(localStorage)),[showDismissed,setShowDismissed]=useState(false)
 const detailRef=useRef(null)
 useEffect(()=>{if(active!==null)detailRef.current?.scrollIntoView({block:'start',behavior:'smooth'})},[active])
 const group=groups.find(g=>g.sourceId===active)
 const rows=filterGroupTransactions(group?.transactions||[],{query,status})
 const label=(g,i)=>g.source?`${g.source.institution||'Bank'} · ${g.source.name||'Account'}${g.source.mask?` · ending ${g.source.mask}`:''}`:`Bank group ${i+1}${g.sourceId?'':' (missing source ID)'}`
 const dismiss=g=>setDismissed(previous=>dismissException(localStorage,previous,exceptionSignature('account',g)))
 const load=async()=>{setBusy(true);setError('');setNotice('');try{const list=await onLoadSources();setNotice(`${list.length} bank accounts loaded. Select a group to review its source details.`)}catch(cause){setError(cause.message||'Bank details could not be loaded.')}finally{setBusy(false)}}
 const accept=async(g,accountId=g.suggestion?.id)=>{const account=accounts.find(a=>a.id===accountId);if(!account)return;setBusy(true);setError('');setNotice('');try{if(!await onReview(account,g.sourceId))throw Error('The account link could not be prepared. Review the account details and try again.');setNotice('Review the exact account link and confirm in Action Mode.')}catch(cause){setError(cause.message||'Unable to prepare account review.')}finally{setBusy(false)}}
 return <section className="dash-card match-account-review" aria-label="Review account links">
  <h2>Review bank activity</h2>
  <p>{groups.length?`${groups.reduce((n,g)=>n+g.count,0)} transactions across ${groups.length} bank account groups need an account link. Open a group to see every transaction.`:'All retained bank activity has a compatible account link.'}</p>
  <div className="match-review-actions"><button aria-expanded={review} onClick={()=>setReview(v=>!v)}>{review?'Hide exceptions':'Review exceptions'}</button>{onLoadSources&&<button disabled={busy||readOnly} onClick={load}>{busy?'Preparing…':'Load bank details'}</button>}{onOpenAccounts&&<button onClick={onOpenAccounts}>Account settings</button>}</div>
  {groups.length>0&&<div className="match-account-groups">{groups.map((g,i)=><button key={g.sourceId||'missing'} className="match-group-button" aria-expanded={active===g.sourceId} aria-controls="bank-group-transactions" onClick={()=>{setActive(active===g.sourceId?null:g.sourceId);setQuery('');setStatus('all');setLimit(25)}}><strong>{label(g,i)}</strong><span>{g.count} transactions · {g.pending} pending</span><span>View transactions →</span></button>)}</div>}
  {group&&<section ref={detailRef} id="bank-group-transactions" className="match-group-detail" aria-label={`${label(group,groups.indexOf(group))} transactions`}>
   <div className="match-review-actions"><h3>{label(group,groups.indexOf(group))}</h3><button onClick={()=>setActive(null)}>Close group</button></div>
   <p>{group.reason}</p><details><summary>Source details</summary><p>Bank source ID: {group.sourceId||'Missing'}{group.source&&` · ${group.source.type||''} ${group.source.subtype||''}`}</p></details>
   {group.source&&!readOnly&&onReview&&<div className="match-review-actions"><label>Household account<select aria-label="Household account for this bank group" value={choices[group.sourceId]||group.suggestion?.id||''} onChange={e=>setChoices({...choices,[group.sourceId]:e.target.value})}><option value="">Choose an account</option>{accounts.filter(a=>compatiblePlaidAccountType(a,group.source)&&!accounts.some(other=>other.id!==a.id&&other.plaidAccountId===group.sourceId)).map(a=><option key={a.id} value={a.id}>{a.name}{a.plaidAccountId?' (replace existing link)':''}</option>)}</select></label><button disabled={busy||!(choices[group.sourceId]||group.suggestion?.id)} onClick={()=>accept(group,choices[group.sourceId]||group.suggestion?.id)}>Review selected account link</button></div>}
   {!group.source&&<p className="match-review-note">This source is not in the loaded bank details. Load bank details above; if it is still missing, verify it from the original account or statement before linking. These records remain available here.</p>}
   <div className="match-group-filters"><label>Find a transaction<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setLimit(25)}}/></label><label>Status<select aria-label="Filter transaction status" value={status} onChange={e=>{setStatus(e.target.value);setLimit(25)}}><option value="all">All activity</option><option value="posted">Posted</option><option value="pending">Pending</option></select></label></div>
   <p>{rows.length} matching transactions · {group.count-group.pending} posted · {group.pending} pending</p>
   <div className="match-group-ledger">{rows.slice(0,limit).map((row,i)=><article key={`${row.id||'missing'}:${i}`}><div><strong>{row.name||row.merchant_name||'Bank transaction'}</strong><span>{row.date||'Date unavailable'} · {row.pending?'Pending':'Posted'}{row.type==='transfer'||/^TRANSFER/.test(row.category||'')?' · Transfer':''}</span><details><summary>Bank description</summary><p>{row.originalStatement||row.original_description||row.name||'Unavailable'}</p></details></div><strong>{Number(row.amount)<0?'+':'−'}{fmtMoney(Math.abs(Number(row.amount)))}</strong></article>)}</div>
   {!rows.length&&<p>No transactions match these filters.</p>}{rows.length>limit&&<button onClick={()=>setLimit(n=>n+25)}>Show more transactions ({rows.length-limit} remaining)</button>}
  </section>}
  {review&&<section aria-label="Exception decisions" className="match-exception-decisions">
   <h3>Suggested changes</h3><p>Accept opens the exact change for approval. Dismiss leaves your records unchanged.</p>
   {groups.some(g=>g.suggestion)&&<><label className="match-dismissed-toggle"><input type="checkbox" checked={showDismissed} onChange={e=>setShowDismissed(e.target.checked)}/> Show dismissed account suggestions</label>{groups.filter(g=>g.suggestion&&(showDismissed||!dismissed.includes(exceptionSignature('account',g)))).map((g,i)=><article className="match-group-detail" key={g.sourceId}><h4>Link {label(g,i)} to {g.suggestion.name}</h4><p>{g.reason} · {g.count} transactions</p><div className="match-review-actions"><button disabled={busy||readOnly} onClick={()=>accept(g)}>Accept account suggestion</button><button disabled={busy||readOnly} onClick={()=>dismiss(g)}>Dismiss account suggestion</button></div></article>)}</>}
   {groups.length>0&&!groups.some(g=>g.suggestion)&&<p>No account link is suggested yet. Open a bank group and load bank details to verify the source.</p>}
   <AutoReconciliationReport compact scheduled={scheduled} actuals={actuals} accounts={accounts} readOnly={readOnly} onReview={onReviewMatches} onOpenPlanned={onOpenPlanned}/>
  </section>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>
}
