import {useState} from 'react'
import {fetchRollingMealPlan} from '../meals/mealPlanApi.js'
import {getHouseholdDateKey} from '../finance/financeTime.js'
import {proposeWeeklyGroceries} from './groceryData.js'
import {groceryRequest} from './groceryApi.js'
import './GroceryList.css'
export default function WeeklyGroceries({onOpenList,canEdit=true}){
 const [start,setStart]=useState(()=>getHouseholdDateKey()),[servings,setServings]=useState('6'),[proposal,setProposal]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const generate=async event=>{event.preventDefault();setBusy(true);setError('');setNotice('');setProposal(null);try{const plan=await fetchRollingMealPlan(start,7);if(plan.days?.length!==7||plan.days[0].date!==start)throw Error('The full selected week could not be verified. Please retry.');setProposal({...proposeWeeklyGroceries(plan.days,Number(servings)),end:plan.days.at(-1).date})}catch(cause){setError(cause.message)}finally{setBusy(false)}}
 const update=(id,patch)=>setProposal(value=>({...value,items:value.items.map(item=>item.id===id?{...item,...patch}:item)}))
 const add=async()=>{setBusy(true);setError('');setNotice('');try{const result=await groceryRequest({action:'add',items:proposal.items.filter(item=>item.selected).map(({name,quantity,category,sources,sourceKey})=>({name,quantity,category,sources,sourceKey}))});setNotice(`${result.added} items added to Grocery List.${result.skipped?` ${result.skipped} already on the list; their saved quantities were kept.`:''}`);setProposal(value=>({...value,items:value.items.map(item=>({...item,selected:false}))}))}catch(cause){setError(cause.message)}finally{setBusy(false)}}
 const selected=proposal?.items.filter(item=>item.selected).length||0
 return <section className="grocery-workspace" aria-label="Weekly grocery proposal"><header><div><p>From your meal plan</p><h2>Proposed weekly groceries</h2><p>Review what you already have, edit quantities, and check only what you need.</p></div>{onOpenList&&<button onClick={onOpenList}>Open Grocery List</button>}</header>
 <form className="grocery-controls" onSubmit={generate}><label>Week starting<input type="date" required value={start} disabled={busy} onChange={event=>{setStart(event.target.value);setProposal(null);setNotice('')}}/></label><label>Default people per meal<input type="number" required min="0.25" max="100" step="0.25" value={servings} disabled={busy} onChange={event=>{setServings(event.target.value);setProposal(null);setNotice('')}}/></label><button disabled={busy}>{busy?'Working…':'Propose groceries'}</button></form>
 <p>Includes breakfast, lunch, dinner, and both snacks for seven days. Quantities use the recipe’s saved batch yield and the people saved for each meal (or the default above); personal macro portions are not applied. Unmeasured ingredients stay “As needed.”</p>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {proposal&&<><h3>{start} – {proposal.end}</h3>{proposal.missing.length>0&&<div role="alert"><strong>Some ingredients need review:</strong>{proposal.missing.map((message,index)=><p key={index}>{message}</p>)}</div>}
 <div className="grocery-controls"><button disabled={busy||!canEdit} onClick={()=>setProposal(value=>({...value,items:value.items.map(item=>({...item,selected:true}))}))}>Check all</button><button disabled={busy} onClick={()=>setProposal(value=>({...value,items:value.items.map(item=>({...item,selected:false}))}))}>Uncheck all</button><span>{selected} selected · {proposal.items.length} proposed items</span></div>
 {!proposal.items.length&&<p>No ingredients are available for this week.</p>}
 <div className="grocery-rows">{proposal.items.map(item=><article key={item.id}><label className="grocery-check"><input type="checkbox" checked={item.selected} disabled={busy||!canEdit} onChange={event=>update(item.id,{selected:event.target.checked})}/><strong>{item.name}</strong></label><label>Quantity for {item.name}<input value={item.quantity} disabled={busy} maxLength={120} onChange={event=>update(item.id,{quantity:event.target.value})}/></label><details><summary>Used in {item.sources.length} planned meals</summary>{item.sources.map(source=><p key={source}>{source}</p>)}</details></article>)}</div>
 <div className="grocery-proposal-footer"><span>Only checked items will be added.</span><button disabled={busy||!canEdit||!selected||proposal.items.some(item=>item.selected&&!item.quantity.trim())} onClick={add}>Add to Grocery List</button></div></>}
 {!canEdit&&<p>Household planning access is required to add grocery items.</p>}
 </section>
}
