import { useEffect, useState } from 'react'
import { HOUSEHOLD_FINANCE_BRIDGE_KEY } from '../household/householdFinanceBridge.js'
import './HouseholdFinanceIntelligence.css'
const money=value=>Number(value||0).toLocaleString('en-US',{style:'currency',currency:'USD'})
const load=()=>{try{return JSON.parse(localStorage.getItem(HOUSEHOLD_FINANCE_BRIDGE_KEY)||'null')}catch{return null}}
export default function HouseholdFinanceIntelligence(){
 const[bridge,setBridge]=useState(load)
 useEffect(()=>{const refresh=event=>{if(event.type==='storage'&&event.key!==HOUSEHOLD_FINANCE_BRIDGE_KEY)return;setBridge(event.detail||load())};window.addEventListener('storage',refresh);window.addEventListener('brevity-household-finance-updated',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('brevity-household-finance-updated',refresh)}},[])
 if(!bridge)return null
 const obligations=[...(bridge.inventory?.purchaseObligations||[]),...(bridge.estate?.maintenanceObligations||[])].sort((a,b)=>Number(b.amount)-Number(a.amount))
 return <section className="household-finance-intelligence"><header><div><p>Household → Finance</p><h2>Operating obligations & avoidable waste</h2></div><strong>{money(bridge.projectedHouseholdObligations)}</strong></header><div className="household-finance-metrics"><article><span>Inventory replenishment</span><strong>{money(bridge.inventory?.projectedReplenishment)}</strong></article><article><span>Estate maintenance</span><strong>{money(bridge.estate?.projectedMaintenance)}</strong></article><article className="is-waste"><span>Waste this month</span><strong>{money(bridge.inventory?.monthlyWaste)}</strong></article><article><span>Inventory on hand</span><strong>{money(bridge.inventory?.onHandValue)}</strong></article></div>{obligations.length>0&&<div className="household-finance-obligations">{obligations.slice(0,8).map(item=><article key={item.id}><span><strong>{item.title}</strong><small>{item.source==='estate-maintenance'?`${item.date||'Upcoming'} · Estate maintenance`:`${item.quantity} ${item.unit} · Inventory replenishment`}</small></span><em>{money(item.amount)}</em></article>)}</div>}<p className="household-finance-note">Projected household obligations are planning intelligence. They do not alter posted bank transactions or actual cash flow until a real transaction posts.</p></section>
}
