import {useMemo,useState} from 'react'
import {buildBudgetLines} from './budgetBreakdown.js'
const categories=['Housing','Utilities','Transportation','Insurance','Health','Debt','Food','Household','Family','Subscriptions','Discretionary','Other']
export default function BudgetAssignment({row,scheduled,budget,onReview}){
 const [choice,setChoice]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const lines=useMemo(()=>buildBudgetLines(scheduled,budget,{accountIds:new Set([row.accountId])}).filter(line=>line.direction==='expense'),[scheduled,budget,row.accountId])
 async function assign(){setBusy(true);setError('');try{
  const line=lines.find(item=>`line:${item.id}`===choice),category=line?.category||choice.replace(/^category:/,'')
  if(!line&&!categories.includes(category))throw Error('Select a category or budget line.')
  await onReview({summary:`Assign ${row.name} to ${line?.name||category}`,storageKey:'lslj_tx_overrides_v1',operation:{type:line?'transaction.allocate':'transaction.categorize',targetId:row.id,description:`Count ${row.name} against ${line?.name||category} for ${row.date.slice(0,7)}. The bank amount and payment remain unchanged.`,payload:line?{budgetLineId:line.id,category}:{category}}})
 }catch(e){setError(e.message)}finally{setBusy(false)}}
 return <section aria-label="Assign category or budget"><h3>Assign category / budget</h3><p>Choose where this charge belongs. It counts once toward actual spending and reduces the remaining budget for its posting month.</p><label>Category or budget line<select value={choice} disabled={busy} onChange={e=>setChoice(e.target.value)}><option value="">Choose a category or budget…</option><optgroup label="Budget lines for this account">{lines.map(line=><option key={line.id} value={`line:${line.id}`}>{line.name} · {line.category} {line.transactions?.[0]?.start?` · from ${line.transactions[0].start}`:''}</option>)}</optgroup><optgroup label="Category only">{categories.map(category=><option key={category} value={`category:${category}`}>{category}</option>)}</optgroup></select></label><button type="button" disabled={busy||!choice} onClick={assign}>{busy?'Preparing…':'Review category assignment'}</button>{!row.accountId&&<p>Map this bank account before assigning an account-specific budget.</p>}{error&&<p role="alert">{error}</p>}</section>
}
