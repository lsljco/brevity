import {useEffect,useState} from 'react'
import {groceryRequest} from './groceryApi.js'
import {GROCERY_CATEGORIES} from './groceryData.js'
import WeeklyGroceries from './WeeklyGroceries.jsx'
import './GroceryList.css'
function GroceryRow({item,canEdit,busy,onUpdate}){
 const [quantity,setQuantity]=useState(item.quantity)
 useEffect(()=>setQuantity(item.quantity),[item.quantity])
 return <article className={item.completed?'is-purchased':''}><label className="grocery-check"><input type="checkbox" aria-label={`Purchased ${item.name}`} checked={item.completed} disabled={!canEdit||busy} onChange={event=>onUpdate(item,{completed:event.target.checked})}/><strong>{item.name}</strong></label><span>{item.category}</span><div className="grocery-controls"><label>Quantity for {item.name}<input maxLength={120} value={quantity} disabled={!canEdit||busy} onChange={event=>setQuantity(event.target.value)}/></label><button disabled={!canEdit||busy||!quantity.trim()||quantity===item.quantity} onClick={()=>onUpdate(item,{quantity})}>Save quantity</button></div>{item.sources?.length>0&&<details><summary>Meal plan references</summary>{item.sources.map(source=><p key={source}>{source}</p>)}</details>}</article>
}
export default function GroceryList(){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[showProposal,setShowProposal]=useState(false),[filter,setFilter]=useState('Needed'),[notice,setNotice]=useState(''),[form,setForm]=useState({name:'',quantity:'1',category:'Other',sourceKey:crypto.randomUUID()})
 const load=async()=>{try{const result=await groceryRequest();setData(current=>!current||result.version>=current.version?result:current);setError('')}catch(cause){setError(cause.message)}}
 useEffect(()=>{let active=true;const refresh=()=>groceryRequest().then(result=>{if(active){setData(current=>!current||result.version>=current.version?result:current);setError('')}}).catch(cause=>{if(active)setError(cause.message)});refresh();window.addEventListener('focus',refresh);window.addEventListener('brevity-app-refreshed',refresh);return()=>{active=false;window.removeEventListener('focus',refresh);window.removeEventListener('brevity-app-refreshed',refresh)}},[])
 const mutate=async body=>{setBusy(true);setError('');setNotice('');try{const result=await groceryRequest(body);setData(result);setNotice(body.action==='add'?'Item added to Grocery List.':'Grocery item updated.');return true}catch(cause){setError(cause.message);return false}finally{setBusy(false)}}
 const add=async event=>{event.preventDefault();if(await mutate({action:'add',items:[form]}))setForm({name:'',quantity:'1',category:'Other',sourceKey:crypto.randomUUID()})}
 const update=(item,patch)=>mutate({action:'update',id:item.id,revision:item.revision,patch})
 const visible=(data?.items||[]).filter(item=>filter==='All'||item.completed===(filter==='Purchased'))
 return <main className="grocery-workspace"><header><div><p>Household Management</p><h1>Grocery List</h1><p>One shared list for food, paper goods, toiletries, cleaning, laundry, and other household needs.</p></div><button onClick={()=>{setShowProposal(value=>!value);if(showProposal)load()}}>{showProposal?'Back to Grocery List':'Propose from weekly meals'}</button></header>
 {showProposal?<WeeklyGroceries canEdit={data?.canEdit===true} onOpenList={()=>{setShowProposal(false);load()}}/>:<>
 {error&&<p role="alert">{error} <button onClick={load}>Refresh list</button></p>}{notice&&<p role="status">{notice}</p>}{!data&&!error&&<p>Loading Grocery List…</p>}
 {data&&<><p>{data.items.filter(item=>!item.completed).length} items needed · {data.items.filter(item=>item.completed).length} purchased</p>
 {data.canEdit&&<form className="grocery-controls grocery-add" onSubmit={add}><label>Item name<input disabled={busy} required maxLength={500} value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label><label>Quantity<input disabled={busy} required maxLength={120} value={form.quantity} onChange={event=>setForm({...form,quantity:event.target.value})}/></label><label>Category<select disabled={busy} aria-label="Category" value={form.category} onChange={event=>setForm({...form,category:event.target.value})}>{GROCERY_CATEGORIES.map(category=><option key={category}>{category}</option>)}</select></label><button disabled={busy}>Add item</button></form>}
 {!data.canEdit&&<p>Your access to this list is read-only.</p>}
 <div className="grocery-controls"><label>Show items<select aria-label="Show items" value={filter} onChange={event=>setFilter(event.target.value)}>{['Needed','Purchased','All'].map(value=><option key={value}>{value}</option>)}</select></label><button disabled={busy} onClick={load}>Refresh list</button></div>
 {!visible.length&&<p>No {filter==='All'?'grocery':filter.toLowerCase()} items.</p>}<div className="grocery-rows">{visible.map(item=><GroceryRow key={item.id} item={item} canEdit={data.canEdit} busy={busy} onUpdate={update}/>)}</div><p>Check an item when purchased. Uncheck it in Purchased to put it back on the needed list.</p></>}
 </>}
 </main>
}
