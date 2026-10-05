import {useEffect,useState} from 'react'
import {fetchEstateWorkspace} from '../estate/estateApi.js'
export function maintenancePriorities(workspace,date){
 const orders=workspace?.workOrders||[],plans=workspace?.maintenancePlans||[]
 const linked=new Set((workspace?.maintenanceEvents||[]).map(x=>x.workOrderId).filter(Boolean))
 return [...(workspace?.maintenanceEvents||[]).filter(x=>!['completed','cost_recorded'].includes(x.status)).map(x=>({...x,title:orders.find(o=>o.id===x.workOrderId)?.title||plans.find(p=>p.id===x.maintenancePlanId)?.title||'Maintenance service',dueDate:x.dueDate||x.scheduledFor})),...orders.filter(x=>!linked.has(x.id)&&!['completed','cost_recorded','closed','cancelled'].includes(x.status))].sort((a,b)=>(a.dueDate||a.scheduledDate||'9999').localeCompare(b.dueDate||b.scheduledDate||'9999'))
}
export default function TodayMaintenance({date,onOpenPillar}){
 const [state,setState]=useState({loading:true})
 useEffect(()=>{let live=true;fetchEstateWorkspace().then(workspace=>{if(live)setState({workspace})}).catch(error=>{if(live)setState({error:error.message})});return()=>{live=false}},[date])
 const items=maintenancePriorities(state.workspace,date)
 return <section className="today-section health-care" aria-label="Household Maintenance"><div className="today-section-heading"><div><span>Household Management · Property care</span><h2>Household Maintenance</h2><p>Repairs, preventive servicing and open work orders</p></div><button onClick={()=>onOpenPillar?.('maintenance')}>Open Household Maintenance</button></div>{state.loading?<p role="status">Loading maintenance priorities…</p>:state.error?<p role="alert">Maintenance records could not be loaded: {state.error}</p>:items.length?<div className="care-list">{items.slice(0,8).map(x=>{const due=x.dueDate||x.scheduledDate;return <article key={x.id}><div><strong>{x.title||'Maintenance work order'}</strong><p>{x.responsibleMember||'Owner not assigned'} · {x.status?.replaceAll('_',' ')||'Open'}</p><small>{due?`${due}${due<date?' · Overdue':due===date?' · Due today':''}`:'Needs scheduling'}</small></div></article>})}{items.length>8&&<p>{items.length-8} more open items in Household Maintenance.</p>}</div>:<p>{state.workspace?'No open maintenance items recorded.':'No property maintenance records are available yet.'} Open Household Maintenance to review property systems and service plans.</p>}</section>
}
