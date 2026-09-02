import { useEffect, useMemo, useState } from 'react'
import { buildDailyAlignmentSnapshot } from './dailyAlignmentData.js'
import { calculateMonthlyCashFlow } from './monthlyCashFlow.js'
import { addDays, toISO, txOccursOnDate } from './projection.js'
import FinanceMeetingsWorkspace from './FinanceMeetingsWorkspace.jsx'

const STORAGE_KEY='brevity_finance_meetings_v1'
const money=value=>Math.abs(Number(value)||0)

function readMeetingStore(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{return{}}}
function sumWindow(transactions=[],startDate,days=7){let inflows=0,obligations=0;for(let offset=0;offset<days;offset+=1){const date=addDays(startDate,offset);transactions.forEach(transaction=>{if(transaction.type==='transfer'||!txOccursOnDate(transaction,date))return;if(transaction.type==='income')inflows+=money(transaction.amount);if(transaction.type==='expense')obligations+=money(transaction.amount)})}return{inflows,obligations}}

export default function FinanceMeetingsBridge({accounts=[],scheduled=[],cashFlowScheduled,actuals=[],budget={},projection}){
  const[ready,setReady]=useState(false)
  const today=useMemo(()=>new Date(),[])
  const auto=useMemo(()=>{
    const dateKey=toISO(today)
    const daily=buildDailyAlignmentSnapshot({date:dateKey,accounts,scheduled,monthlyScheduled:cashFlowScheduled||scheduled,actuals,budget,projectedBalance:projection?.get?.(dateKey)?.bal})
    const weekly=sumWindow(scheduled,today,7)
    const monthly=calculateMonthlyCashFlow(cashFlowScheduled||scheduled,today)
    return{currentMonthlyNet:daily.monthlyCashFlow,operatingBalance:daily.availableOperatingCash,operatingAvailable:daily.availableOperatingCash,weekInflows:weekly.inflows,weekObligations:weekly.obligations,monthForecast:monthly.cashFlow}
  },[today,accounts,scheduled,cashFlowScheduled,actuals,budget,projection])

  useEffect(()=>{
    const current=readMeetingStore(),snapshot={...(current.snapshot||{})},previousAuto=current.autoSnapshot||{}
    Object.entries(auto).forEach(([key,value])=>{
      const next=Number.isFinite(Number(value))?Number(value):''
      const currentValue=snapshot[key]
      const wasAutomatic=currentValue===''||currentValue==null||Object.prototype.hasOwnProperty.call(previousAuto,key)&&Number(currentValue)===Number(previousAuto[key])
      if(wasAutomatic)snapshot[key]=next
    })
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify({...current,snapshot,autoSnapshot:auto}))}catch{}
    setReady(true)
  },[auto])

  if(!ready)return <div className="app-view-loading">Preparing Finance Meetings…</div>
  return <FinanceMeetingsWorkspace/>
}
