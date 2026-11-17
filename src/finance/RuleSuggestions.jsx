import {useMemo,useState} from 'react'
import {buildRuleSuggestions} from './ruleSuggestions.js'
import {describeRuleCriteria} from './ruleCriteria.js'
import VendorSelector from './VendorSelector.jsx'
import './AccountingWorkspace.css'

export default function RuleSuggestions({planned,transactions,rules,accounts,overrides,establishedCategories,directory,onReview,onClose,onReviewTransaction}){
 const report=useMemo(()=>buildRuleSuggestions({planned,transactions,rules,accounts,overrides,establishedCategories,directory}),[planned,transactions,rules,accounts,overrides,establishedCategories,directory])
 const [denied,setDenied]=useState(()=>{try{return new Set(JSON.parse(localStorage.getItem('lslj_rule_suggestion_denials_v1')||'[]'))}catch{return new Set()}}),[page,setPage]=useState(0),[selected,setSelected]=useState(new Set()),[categoryOverrides,setCategoryOverrides]=useState({}),[vendorOverrides,setVendorOverrides]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const denialKey=row=>JSON.stringify([row.id,row.evidence])
 const deny=selected=>setDenied(prev=>{const next=new Set([...prev,...selected.map(denialKey)]);localStorage.setItem('lslj_rule_suggestion_denials_v1',JSON.stringify([...next]));return next})
 const rows=report.suggestions.filter(r=>!denied.has(denialKey(r))).map(r=>({...r,category:categoryOverrides[r.id]??r.category,vendorId:vendorOverrides[r.id]??r.vendorId}))
 const approve=async selected=>{setBusy(true);setError('');try{if(selected.length>500)throw Error('Review up to 500 rules at a time.');if(selected.some(row=>!row.category.trim()))throw Error('Choose a category for each rule.');if(await onReview(selected)!==false)onClose()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <section className="rule-suggestions" aria-label="Suggested categorization changes" style={{marginTop:20,padding:16,border:'1px solid var(--gold)',borderRadius:12}}>
  <h3>Suggested categorization changes</h3>
  <details><summary>How suggestions work</summary><p>Rules apply to matching past and future posted transactions. You review changes before applying them.</p></details>
  <p>{rows.length} proposals · {report.unresolved.length} transactions need a closer look. Historical coverage is limited to bank history imported into Brevity.</p>
  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
   <label><input type="checkbox" aria-label="Select all suggestions" checked={rows.length>0&&rows.every(row=>selected.has(row.id))} onChange={e=>setSelected(e.target.checked?new Set(rows.map(row=>row.id)):new Set())}/> Select all suggestions</label><button type="button" disabled={busy||!rows.some(row=>selected.has(row.id))} onClick={()=>approve(rows.filter(row=>selected.has(row.id)))}>Review selected</button>
   <button type="button" disabled={busy||!rows.length} onClick={()=>deny(rows)}>Dismiss all</button>
  </div>

  {rows.slice(page*20,page*20+20).map(row=><article key={row.id} style={{padding:'16px 0',borderTop:'1px solid var(--glass-border)'}}>
   <input type="checkbox" aria-label={`Select ${row.title}`} checked={selected.has(row.id)} onChange={e=>setSelected(old=>{const next=new Set(old);e.target.checked?next.add(row.id):next.delete(row.id);return next})}/><details><summary><strong>{row.ruleId?'Update existing rule':'Create rule'}: {row.title}</strong> · {row.category} · {row.transactions.length} transactions</summary><label>Category<input value={row.category} onChange={e=>setCategoryOverrides(old=>({...old,[row.id]:e.target.value}))}/></label>
   <p>{row.reason}<br/>Category: <strong>{row.category}</strong><br/>{describeRuleCriteria(row.criteria,accounts)}</p>
   <VendorSelector label={`Vendor for ${row.title}`} fieldLabel="Vendor / payer (optional)" value={row.vendorId} onChange={value=>setVendorOverrides(prev=>({...prev,[row.id]:value}))}/>
   <p>Vendor assignment is optional.</p>
   <details><summary>{row.transactions.length} matching past transactions</summary>{row.transactions.map((tx,i)=><p key={tx.id||i}>{tx.date} · {tx.originalStatement||tx.original_description||tx.name} · ${Math.abs(Number(tx.amount)).toFixed(2)}<br/>Current category: {tx.category||tx.cat||'Uncategorized'} → {row.category}</p>)}</details>
   <div style={{display:'flex',gap:10,marginTop:12}}><button type="button" disabled={busy||!row.category.trim()} onClick={()=>approve([row])}>Review changes</button><button type="button" disabled={busy} onClick={()=>deny([row])}>Dismiss</button></div>
  </details></article>)}
  <div className="bulk-selection"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1} of {Math.max(1,Math.ceil(rows.length/20))}</span><button disabled={(page+1)*20>=rows.length} onClick={()=>setPage(p=>p+1)}>Next</button></div>
  {report.unresolved.length>0&&<details><summary>Uncategorized · Needs review ({report.unresolved.length})</summary>{report.unresolved.map(({transaction:tx,reason,category},i)=><p key={tx.id||i}><strong>{category} · Needs review</strong><br/>{tx.date} · {tx.originalStatement||tx.name} · ${Math.abs(Number(tx.amount)).toFixed(2)}<br/>{reason}{onReviewTransaction&&<><br/><button type="button" onClick={()=>onReviewTransaction(tx)}>Review transaction</button></>}</p>)}</details>}
  {denied.size>0&&<button type="button" disabled={busy} onClick={()=>{localStorage.removeItem('lslj_rule_suggestion_denials_v1');setDenied(new Set())}}>Restore denied suggestions</button>}
  {error&&<p role="alert">{error}</p>}
 </section>
}
