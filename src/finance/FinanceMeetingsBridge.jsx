import { useMemo } from 'react'
import { buildDailyAlignmentSnapshot } from './dailyAlignmentData.js'
import { calculateMonthlyCashFlow, calculateScheduledTotalsForMonth, calculateTransactionAmountForMonth } from './monthlyCashFlow.js'
import { addDays, toISO, txOccursOnDate } from './projection.js'
import { transactionDirection } from './reportingData.js'
import FinanceMeetingsWorkspace from './FinanceMeetingsWorkspace.jsx'

const money=value=>Math.abs(Number(value)||0)
const txName=transaction=>transaction.name||transaction.merchant_name||transaction.merchantName||transaction.description||'Transaction'
const txMeta=transaction=>[transaction.date,transaction.category||transaction.cat,transaction.accountName].filter(Boolean).join(' · ')

function scheduledRows(transactions=[],startDate,days=7,type){
  const rows=[]
  for(let offset=0;offset<days;offset+=1){
    const date=addDays(startDate,offset)
    transactions.forEach(transaction=>{
      if(transaction.type!==type||!txOccursOnDate(transaction,date))return
      rows.push({id:`${type}-${transaction.id||txName(transaction)}-${toISO(date)}`,label:txName(transaction),amount:money(transaction.amount),meta:[toISO(date),transaction.cat].filter(Boolean).join(' · ')})
    })
  }
  return rows
}

function actualMonthBreakdown(actuals=[],today){
  const dateKey=toISO(today)
  const monthPrefix=dateKey.slice(0,7)
  const rows=actuals.filter(transaction=>transaction.date?.startsWith(monthPrefix)&&transaction.date<=dateKey&&transactionDirection(transaction)!=='transfer')
  const income=rows.filter(transaction=>transactionDirection(transaction)==='income').map(transaction=>({id:transaction.id,label:txName(transaction),amount:money(transaction.amount),meta:txMeta(transaction)}))
  const expenses=rows.filter(transaction=>transactionDirection(transaction)==='expense').map(transaction=>({id:transaction.id,label:txName(transaction),amount:money(transaction.amount),meta:txMeta(transaction)}))
  return{income,expenses}
}

function scheduledMonthBreakdown(transactions=[],today){
  const income=[],expenses=[]
  transactions.forEach(transaction=>{
    if(transaction.type==='transfer')return
    const amount=calculateTransactionAmountForMonth(transaction,today,{recurringOnly:false})
    if(!amount)return
    const row={id:transaction.id,label:txName(transaction),amount:money(amount),meta:transaction.cat||'Scheduled'}
    if(transaction.type==='income')income.push(row)
    if(transaction.type==='expense')expenses.push(row)
  })
  return{income,expenses}
}

const sum=rows=>rows.reduce((total,row)=>total+money(row.amount),0)

export default function FinanceMeetingsBridge({accounts=[],scheduled=[],cashFlowScheduled,actuals=[],budget={},projection}){
  const today=useMemo(()=>new Date(),[])
  const model=useMemo(()=>{
    const dateKey=toISO(today)
    const projectedSource=cashFlowScheduled||scheduled
    const daily=buildDailyAlignmentSnapshot({date:dateKey,accounts,scheduled,monthlyScheduled:projectedSource,actuals,budget,projectedBalance:projection?.get?.(dateKey)?.bal})
    const weekIncome=scheduledRows(scheduled,today,7,'income')
    const weekExpenses=scheduledRows(scheduled,today,7,'expense')
    const todayIncome=scheduledRows(scheduled,today,2,'income')
    const todayExpenses=scheduledRows(scheduled,today,2,'expense')
    const recurringMonthly=calculateMonthlyCashFlow(projectedSource,today)
    const projectedTotals=calculateScheduledTotalsForMonth(projectedSource,today,{recurringOnly:false})
    const actualMonth=actualMonthBreakdown(actuals,today)
    const scheduledMonth=scheduledMonthBreakdown(projectedSource,today)
    const actualIncome=sum(actualMonth.income),actualExpenses=sum(actualMonth.expenses),actualNet=actualIncome-actualExpenses
    const projectedIncome=sum(scheduledMonth.income),projectedExpenses=sum(scheduledMonth.expenses),projectedNet=projectedIncome-projectedExpenses
    const cashRows=accounts.map(account=>({id:account.id,label:account.name||account.accountName||'Account',amount:Number(account.available??account.availableBalance??account.balance??account.current??account.currentBalance??0),meta:`Current ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(account.balance??account.current??account.currentBalance??0))}`}))
    const approvedDiscretionary=Math.max(Number(daily.approvedDiscretionary)||0,0)
    const liveSnapshot={
      currentMonthlyNet:actualNet,
      actualMonthlyNet:actualNet,
      projectedMonthlyNet:projectedNet,
      operatingBalance:daily.availableOperatingCash,
      operatingAvailable:daily.availableOperatingCash,
      todayInflows:daily.expectedInflows,
      todayObligations:daily.dueTodayTomorrow,
      approvedDiscretionary,
      weekInflows:sum(weekIncome),
      weekObligations:sum(weekExpenses),
      monthForecast:projectedTotals.net,
    }
    const actualDrilldown={label:'Actual monthly net cash flow',amount:actualNet,note:'Posted month-to-date income minus posted month-to-date expenses. Transfers are excluded.',source:'Posted transactions',children:[{label:'Income',amount:actualIncome,meta:'Posted this month · transfers excluded',children:actualMonth.income},{label:'Expenses',amount:actualExpenses,meta:'Posted this month · transfers excluded',children:actualMonth.expenses}]}
    const projectedDrilldown={label:'Projected monthly net cash flow',amount:projectedNet,note:'All projected income minus all projected expenses for the calendar month. Transfers are excluded.',source:'Finance projection',children:[{label:'Projected income',amount:projectedIncome,meta:'All projected income this month',children:scheduledMonth.income},{label:'Projected expenses',amount:projectedExpenses,meta:'All projected expenses this month',children:scheduledMonth.expenses}]}
    const drilldowns={
      currentMonthlyNet:actualDrilldown,
      actualMonthlyNet:actualDrilldown,
      projectedMonthlyNet:projectedDrilldown,
      operatingAvailable:{label:'Available cash',amount:daily.availableOperatingCash,note:'Available cash for the account scope selected above.',source:'Selected Finance accounts',children:cashRows},
      operatingBalance:{label:'Current balance',amount:daily.availableOperatingCash,note:'Current balance across the account scope selected above.',source:'Selected Finance accounts',children:cashRows},
      todayInflows:{label:'Expected inflows today / tomorrow',amount:sum(todayIncome),source:'Scheduled transactions',children:todayIncome},
      todayObligations:{label:'Obligations due today / tomorrow',amount:sum(todayExpenses),source:'Scheduled transactions',children:todayExpenses},
      approvedDiscretionary:{label:'Approved discretionary amount',amount:approvedDiscretionary,note:'Remaining discretionary budget divided across the remaining days in the month.',source:'Budget + posted spending',children:[]},
      weekInflows:{label:'Expected inflows this week',amount:sum(weekIncome),source:'Scheduled transactions',children:weekIncome},
      weekObligations:{label:'Obligations this week',amount:sum(weekExpenses),source:'Scheduled transactions',children:weekExpenses},
      monthForecast:{label:'Projected month-end net cash flow',amount:projectedTotals.net,note:'All projected monthly income minus all projected monthly expenses. Transfers are excluded.',source:'Finance forecast',children:[{label:'Income',amount:projectedTotals.income,children:scheduledMonth.income},{label:'Expenses',amount:projectedTotals.expenses,children:scheduledMonth.expenses}]},
      recurringMonthForecast:{label:'Recurring-only monthly net',amount:recurringMonthly.cashFlow,note:'Recurring scheduled income minus recurring scheduled expenses.',source:'Recurring finance plan',children:[]},
    }
    return{liveSnapshot,drilldowns}
  },[today,accounts,scheduled,cashFlowScheduled,actuals,budget,projection])

  const accountScope=useMemo(()=>{
    if(!accounts.length)return'No selected accounts'
    if(accounts.length===1)return accounts[0].name||accounts[0].accountName||'Selected account'
    return`${accounts.length} selected accounts`
  },[accounts])

  return <FinanceMeetingsWorkspace liveSnapshot={model.liveSnapshot} drilldowns={model.drilldowns} accountScope={accountScope}/>
}
