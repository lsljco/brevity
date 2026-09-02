import { useMemo } from 'react'
import { buildDailyAlignmentSnapshot } from './dailyAlignmentData.js'
import { calculateMonthlyCashFlow } from './monthlyCashFlow.js'
import { addDays, toISO, txOccursOnDate } from './projection.js'
import FinanceMeetingsWorkspace from './FinanceMeetingsWorkspace.jsx'

const money=value=>Math.abs(Number(value)||0)

function sumWindow(transactions=[],startDate,days=7){
  let inflows=0,obligations=0
  for(let offset=0;offset<days;offset+=1){
    const date=addDays(startDate,offset)
    transactions.forEach(transaction=>{
      if(transaction.type==='transfer'||!txOccursOnDate(transaction,date))return
      if(transaction.type==='income')inflows+=money(transaction.amount)
      if(transaction.type==='expense')obligations+=money(transaction.amount)
    })
  }
  return{inflows,obligations}
}

export default function FinanceMeetingsBridge({accounts=[],scheduled=[],cashFlowScheduled,actuals=[],budget={},projection}){
  const today=useMemo(()=>new Date(),[])
  const liveSnapshot=useMemo(()=>{
    const dateKey=toISO(today)
    const daily=buildDailyAlignmentSnapshot({
      date:dateKey,
      accounts,
      scheduled,
      monthlyScheduled:cashFlowScheduled||scheduled,
      actuals,
      budget,
      projectedBalance:projection?.get?.(dateKey)?.bal,
    })
    const weekly=sumWindow(scheduled,today,7)
    const monthly=calculateMonthlyCashFlow(cashFlowScheduled||scheduled,today)
    return{
      currentMonthlyNet:daily.monthlyCashFlow,
      operatingBalance:daily.availableOperatingCash,
      operatingAvailable:daily.availableOperatingCash,
      todayInflows:daily.expectedInflows,
      todayObligations:daily.dueTodayTomorrow,
      approvedDiscretionary:daily.approvedDiscretionary,
      weekInflows:weekly.inflows,
      weekObligations:weekly.obligations,
      monthForecast:monthly.cashFlow,
    }
  },[today,accounts,scheduled,cashFlowScheduled,actuals,budget,projection])

  const accountScope=useMemo(()=>{
    if(!accounts.length)return'No selected accounts'
    if(accounts.length===1)return accounts[0].name||accounts[0].accountName||'Selected account'
    return`${accounts.length} selected accounts`
  },[accounts])

  return <FinanceMeetingsWorkspace liveSnapshot={liveSnapshot} accountScope={accountScope}/>
}
