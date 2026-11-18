import {useMemo,useState} from 'react'
import {buildBudgetLines} from './budgetBreakdown.js'
import {prepareDirectAction} from '../assistant/assistantApi.js'
import {requestActionReview} from '../assistant/actionEvents.js'
import {getAcknowledgedSharedStateVersion} from '../household/sharedState.js'
import {budgetItemOperations} from './budgetItemOperations.js'

export default function BudgetItemEditor({data,initialMonth,onClose}){
 const [direction,setDirection]=useState('expense'),[accountId,setAccount]=useState(data.accounts?.[0]?.id||''),[lineId,setLine]=useState(''),[name,setName]=useState(''),[category,setCategory]=useState(''),[amount,setAmount]=useState(''),[month,setMonth]=useState(initialMonth),[repeat,setRepeat]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const lines=useMemo(()=>buildBudgetLines(data.scheduled||[],data.budget||{}, {accountIds:new Set([accountId])}).filter(l=>l.direction===direction),[data,accountId,direction])
 function select(id){setLine(id);const line=lines.find(l=>l.id===id);if(line){setName(line.name);setCategory(line.category)}}
 async function submit(event){event.preventDefault();setBusy(true);setError('');try{
  const matching=lines.find(l=>l.id===lineId)||lines.find(l=>l.name.trim().toLowerCase()===name.trim().toLowerCase()&&l.category===(direction==='income'?'Income':category.trim()))
  const operations=budgetItemOperations({line:matching,name,category,direction,accountId,amount,month,repeat})
  const result=await prepareDirectAction({summary:`${matching?'Update':'Add'} ${name.trim()} budget`,operations,expectedVersion:getAcknowledgedSharedStateVersion(localStorage,'lslj_budget_v1')})
  if(!result?.proposal?.id)throw Error('The budget review could not be prepared.')
  onClose();requestActionReview(result.proposal)
 }catch(e){setError(e.message)}finally{setBusy(false)}}
 return <form className="spending-editor budget-item-editor" aria-label="Add to Budget" onSubmit={submit}>
  <h3>Add to Budget</h3>
  <label>Type<select aria-label="Type" value={direction} onChange={e=>{setDirection(e.target.value);setLine('')}}><option value="expense">Expense</option><option value="income">Income</option></select></label>
  <label>Account<select aria-label="Account" required value={accountId} onChange={e=>{setAccount(e.target.value);setLine('')}}>{(data.accounts||[]).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
  {lines.length>0&&<label>Budget item<select value={lineId} onChange={e=>select(e.target.value)}><option value="">New item</option>{lines.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
  <label>Item name<input autoFocus required maxLength={120} value={name} onChange={e=>setName(e.target.value)} disabled={Boolean(lineId)}/></label>
  {direction==='expense'&&<label>Category<input required maxLength={120} list="budget-item-categories" value={category} onChange={e=>setCategory(e.target.value)} disabled={Boolean(lineId)}/><datalist id="budget-item-categories">{[...new Set(lines.map(l=>l.category))].map(c=><option key={c} value={c}/>)}</datalist></label>}
  <label>Monthly budget amount ($)<input required type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
  <label>Budget month<input required type="month" min="2000-01" max="2100-12" value={month} onChange={e=>setMonth(e.target.value)}/></label>
  <label>Apply for<select aria-label="Apply for" value={repeat?'repeat':'once'} onChange={e=>setRepeat(e.target.value==='repeat')}><option value="once">This month only</option><option value="repeat">Every month through December {month.slice(0,4)}</option></select></label>
  <p>Set a budget target for the selected account and months. Dated payments and receipts are scheduled separately in Cash Forecast.</p>
  {error&&<p role="alert">{error}</p>}
  <button type="submit" disabled={busy||!accountId}>{busy?'Preparing review…':'Review budget item'}</button><button type="button" onClick={onClose} disabled={busy}>Cancel</button>
 </form>
}
