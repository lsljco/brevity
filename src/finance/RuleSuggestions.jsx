import {useMemo,useState} from 'react'
import {buildRuleSuggestions} from './ruleSuggestions.js'
import {describeRuleCriteria} from './ruleCriteria.js'
import VendorSelector from './VendorSelector.jsx'

export default function RuleSuggestions({planned,transactions,rules,accounts,overrides,establishedCategories,directory,onReview,onClose,onReviewTransaction}){
 const report=useMemo(()=>buildRuleSuggestions({planned,transactions,rules,accounts,overrides,establishedCategories,directory}),[planned,transactions,rules,accounts,overrides,establishedCategories,directory])
 const [denied,setDenied]=useState(()=>{try{return new Set(JSON.parse(localStorage.getItem('lslj_rule_suggestion_denials_v1')||'[]'))}catch{return new Set()}}),[vendorOverrides,setVendorOverrides]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const denialKey=row=>JSON.stringify([row.id,row.evidence])
 const deny=selected=>setDenied(prev=>{const next=new Set([...prev,...selected.map(denialKey)]);localStorage.setItem('lslj_rule_suggestion_denials_v1',JSON.stringify([...next]));return next})
 const rows=report.suggestions.filter(r=>!denied.has(denialKey(r))).map(r=>({...r,vendorId:vendorOverrides[r.id]??r.vendorId}))
 const approve=async selected=>{setBusy(true);setError('');try{if(await onReview(selected)!==false)onClose()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <section className="rule-suggestions" aria-label="Suggested categorization changes" style={{marginTop:20,padding:16,border:'1px solid var(--gold)',borderRadius:12}}>
  <h3>Suggested categorization changes</h3>
  <p>Compare your projected income and expenses with all {report.postedCount} loaded posted transactions. Approved rules apply to all matching past and future posted transactions.</p>
  <p>{rows.length} proposals · {report.unresolved.length} transactions need a closer look. Historical coverage is limited to bank history imported into Brevity.</p>
  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
   <button type="button" disabled={busy||!rows.length||rows.some(r=>!r.vendorId)} onClick={()=>approve(rows)}>Approve all</button>
   <button type="button" disabled={busy||!rows.length} onClick={()=>deny(rows)}>Deny all</button>
  </div>
  <p><small>Approve opens a final review of the exact changes. Denied proposals stay dismissed on this device until their supporting evidence changes.</small></p>
  {rows.map(row=><article key={row.id} style={{padding:'16px 0',borderTop:'1px solid var(--glass-border)'}}>
   <strong>{row.ruleId?'Update existing rule':'Create rule'}: {row.title}</strong>
   <p>{row.reason}<br/>Category: <strong>{row.category}</strong><br/>{describeRuleCriteria(row.criteria,accounts)}</p>
   <VendorSelector required label={`Vendor for ${row.title}`} fieldLabel="Proposed vendor / payer" value={row.vendorId} onChange={value=>setVendorOverrides(prev=>({...prev,[row.id]:value}))}/>
   {!row.vendorId&&<p>Choose or create the vendor or payer to complete this proposal.</p>}
   <details><summary>{row.transactions.length} matching past transactions</summary>{row.transactions.map((tx,i)=><p key={tx.id||i}>{tx.date} · {tx.originalStatement||tx.original_description||tx.name} · ${Math.abs(Number(tx.amount)).toFixed(2)}<br/>Current category: {tx.category||tx.cat||'Uncategorized'} → {row.category}</p>)}</details>
   <div style={{display:'flex',gap:10,marginTop:12}}><button type="button" disabled={busy||!row.vendorId} onClick={()=>approve([row])}>Approve</button><button type="button" disabled={busy} onClick={()=>deny([row])}>Deny</button></div>
  </article>)}
  {report.unresolved.length>0&&<details><summary>Uncategorized · Needs review ({report.unresolved.length})</summary>{report.unresolved.map(({transaction:tx,reason,category},i)=><p key={tx.id||i}><strong>{category} · Needs review</strong><br/>{tx.date} · {tx.originalStatement||tx.name} · ${Math.abs(Number(tx.amount)).toFixed(2)}<br/>{reason}{onReviewTransaction&&<><br/><button type="button" onClick={()=>onReviewTransaction(tx)}>Review transaction</button></>}</p>)}</details>}
  {denied.size>0&&<button type="button" disabled={busy} onClick={()=>{localStorage.removeItem('lslj_rule_suggestion_denials_v1');setDenied(new Set())}}>Restore denied suggestions</button>}
  {error&&<p role="alert">{error}</p>}
 </section>
}
