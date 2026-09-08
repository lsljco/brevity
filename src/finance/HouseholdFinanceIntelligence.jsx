import { useEffect, useMemo, useState } from 'react'
import { readHouseholdFinanceProjection } from '../household/householdFinanceBridge.js'
import { HOUSEHOLD_INVENTORY_STORAGE_KEY } from '../household/householdInventoryData.js'
import { SHARED_STATE_EVENT } from '../household/sharedState.js'
import { fetchEstateWorkspace } from '../estate/estateApi.js'
import './HouseholdFinanceIntelligence.css'

const money=value=>Number(value||0).toLocaleString('en-US',{style:'currency',currency:'USD'})

export default function HouseholdFinanceIntelligence(){
  const[revision,setRevision]=useState(0),[estateWorkspace,setEstateWorkspace]=useState(null)
  useEffect(()=>{
    let active=true
    fetchEstateWorkspace().then(value=>{if(active)setEstateWorkspace(value)}).catch(()=>{})
    const refresh=event=>{
      if(event.type==='storage'&&event.key!==HOUSEHOLD_INVENTORY_STORAGE_KEY)return
      if(event.type===SHARED_STATE_EVENT&&!event.detail?.keys?.includes(HOUSEHOLD_INVENTORY_STORAGE_KEY))return
      setRevision(value=>value+1)
    }
    window.addEventListener('storage',refresh)
    window.addEventListener(SHARED_STATE_EVENT,refresh)
    return()=>{active=false;window.removeEventListener('storage',refresh);window.removeEventListener(SHARED_STATE_EVENT,refresh)}
  },[])
  const bridge=useMemo(()=>readHouseholdFinanceProjection(localStorage,{estateWorkspace}),[estateWorkspace,revision])
  const obligations=[...(bridge.inventory?.purchaseObligations||[]),...(bridge.estate?.maintenanceObligations||[])].sort((a,b)=>Number(b.amount)-Number(a.amount))
  return <section className="household-finance-intelligence"><header><div><p>Household → Finance</p><h2>Operating obligations & avoidable waste</h2></div><strong>{money(bridge.projectedHouseholdObligations)}</strong></header><div className="household-finance-metrics"><article><span>Inventory replenishment</span><strong>{money(bridge.inventory?.projectedReplenishment)}</strong></article><article><span>Estate maintenance</span><strong>{money(bridge.estate?.projectedMaintenance)}</strong></article><article className="is-waste"><span>Waste this month</span><strong>{money(bridge.inventory?.monthlyWaste)}</strong></article><article><span>Inventory on hand</span><strong>{money(bridge.inventory?.onHandValue)}</strong></article></div>{obligations.length>0&&<div className="household-finance-obligations">{obligations.slice(0,8).map(item=><article key={item.id}><span><strong>{item.title}</strong><small>{item.source==='estate-maintenance'?`${item.date||'Upcoming'} · Estate maintenance`:`${item.quantity} ${item.unit} · Inventory replenishment`}</small></span><em>{money(item.amount)}</em></article>)}</div>}<p className="household-finance-note">These values are derived live from approved Inventory and Estate records. They are planning intelligence only: Brevity does not create purchases, posted transactions, or money movement.</p></section>
}
