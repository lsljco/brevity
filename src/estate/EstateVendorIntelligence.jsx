import { useMemo } from 'react'
import './EstateVendorIntelligence.css'

const money=value=>Number(value||0).toLocaleString('en-US',{style:'currency',currency:'USD'})
const vendorName=vendor=>vendor.company||vendor.name||vendor.title||vendor.id

export default function EstateVendorIntelligence({ workspace }){
  const vendors=workspace.vendors||[]
  const records=useMemo(()=>vendors.map(vendor=>{
    const plans=(workspace.maintenancePlans||[]).filter(plan=>plan.preferredVendorId===vendor.id)
    const workOrders=(workspace.workOrders||[]).filter(order=>order.vendorId===vendor.id||order.preferredVendorId===vendor.id||plans.some(plan=>plan.id===order.maintenancePlanId))
    const events=(workspace.maintenanceEvents||[]).filter(event=>workOrders.some(order=>order.id===event.workOrderId))
    const expenses=(workspace.expenses||[]).filter(expense=>expense.vendorId===vendor.id||expense.payeeId===vendor.id||String(expense.vendor||expense.payee||'').toLowerCase()===vendorName(vendor).toLowerCase())
    const spend=expenses.reduce((sum,item)=>sum+Math.abs(Number(item.amount||item.cost||0)),0)+events.filter(event=>event.actualCost!=null).reduce((sum,event)=>sum+Number(event.actualCost||0),0)
    const dates=[...events.map(event=>event.completedAt||event.scheduledFor),...expenses.map(expense=>expense.date||expense.postedAt)].filter(Boolean).sort()
    return {vendor,plans,workOrders,openWork:workOrders.filter(order=>!['completed','cost_recorded','cancelled'].includes(order.status)).length,spend,lastService:dates.at(-1)||''}
  }).sort((a,b)=>b.openWork-a.openWork||b.spend-a.spend),[workspace,vendors])

  return <section className="estate-vendor-intelligence">
    <header><div><p>Vendor Intelligence</p><h2>Household institutional memory</h2><span>Preferred trades, linked maintenance, open work and known historical spend.</span></div><strong>{vendors.length} vendor{vendors.length===1?'':'s'}</strong></header>
    {!records.length?<div className="estate-vendor-empty"><i className="ti ti-address-book"/><span>No vendors are registered yet. Imported Malbec vendors will appear here with their maintenance history.</span></div>:<div className="estate-vendor-grid">{records.map(({vendor,plans,openWork,spend,lastService})=><article key={vendor.id}>
      <div className="estate-vendor-heading"><span><strong>{vendorName(vendor)}</strong><small>{vendor.trade||vendor.category||vendor.serviceType||'Estate vendor'}</small></span>{openWork>0&&<em>{openWork} open</em>}</div>
      <dl><div><dt>Maintenance plans</dt><dd>{plans.length}</dd></div><div><dt>Known spend</dt><dd>{money(spend)}</dd></div><div><dt>Last activity</dt><dd>{lastService?new Date(`${String(lastService).slice(0,10)}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'}</dd></div></dl>
      <footer><span>{vendor.phone||vendor.email||vendor.contactName||'Contact details not recorded'}</span>{vendor.rating&&<strong><i className="ti ti-star-filled"/> {vendor.rating}</strong>}</footer>
    </article>)}</div>}
  </section>
}
