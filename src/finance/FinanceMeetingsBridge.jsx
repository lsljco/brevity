import { useMemo } from 'react'
import { buildDailyAlignmentSnapshot } from './dailyAlignmentData.js'
import { calculateMonthlyCashFlow, calculateTransactionAmountForMonth } from './monthlyCashFlow.js'
import { addDays, toISO, txOccursOnDate } from './projection.js'
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
  const monthPrefix=toISO(today).slice(0,7)
  const rows=actuals.filter(transaction=>transaction.date?.startsWith(monthPrefix)&&transaction.date<=toISO(today))
  const income=rows.filter(transaction=>Number(transaction.amount)<0).map(transaction=>({id:transaction.id,label:txName(transaction),amount:money(transaction.amount),meta:txMeta(transaction)}))
  const expenses=rows.filter(transaction=>Number(transaction.amount)>0).map(transaction=>({id:transaction.id,label:txName(transaction),amount:money(transaction.amount),meta:txMeta(transaction)}))
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
    const daily=buildDailyAlignmentSnapshot({date:dateKey,accounts,scheduled,monthlyScheduled:cashFlowScheduled||scheduled,actuals,budget,projectedBalance:projection?.get?.(dateKey)?.bal})
    const weekIncome=scheduledRows(scheduled,today,7,'income')
    const weekExpenses=scheduledRows(scheduled,today,7,'expense')
    const todayIncome=scheduledRows(scheduled,today,2,'income')
    const todayExpenses=scheduledRows(scheduled,today,2,'expense')
    const monthly=calculateMonthlyCashFlow(cashFlowScheduled||scheduled,today)
    const actualMonth=actualMonthBreakdown(actuals,today)
    const scheduledMonth=scheduledMonthBreakdown(cashFlowScheduled||scheduled,today)
    const useActual=actualMonth.income.length+actualMonth.expenses.length>0
    const monthRows=useActual?actualMonth:scheduledMonth
    const incomeTotal=sum(monthRows.income),expenseTotal=sum(monthRows.expenses)
    const cashRows=accounts.map(account=>({id:account.id,label:account.name||account.accountName||'Account',amount:Number(account.available??account.availableBalance??account.balance??account.current??account.currentBalance??0),meta:`Current ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(account.balance??account.current??account.currentBalance??0))}`}))
    const approvedDiscretionary=Math.max(Number(daily.approvedDiscretionary)||0,0)
    const liveSnapshot={
      currentMonthlyNet:daily.monthlyCashFlow,
      operatingBalance:daily.availableOperatingCash,
      operatingAvailable:daily.availableOperatingCash,
      todayInflows:daily.expectedInflows,
      todayObligations:daily.dueTodayTomorrow,
      approvedDiscretionary,
      weekInflows:sum(weekIncome),
      weekObligations:sum(weekExpenses),
      monthForecast:monthly.cashFlow,
    }
    const drilldowns={
      currentMonthlyNet:{label:'Current monthly net cash flow',amount:daily.monthlyCashFlow,note:useActual?'Posted month-to-date income minus posted month-to-date expenses.':'Scheduled monthly income minus scheduled monthly expenses.',source:useActual?'Posted transactions':'Scheduled finance plan',children:[{label:'Income',amount:incomeTotal,meta:useActual?'Posted this month':'Scheduled this month',children:monthRows.income},{label:'Expenses',amount:expenseTotal,meta:useActual?'Posted this month':'Scheduled this month',children:monthRows.expenses}]},
      operatingAvailable:{label:'Available cash',amount:daily.availableOperatingCash,note:'Available cash for the account scope selected above.',source:'Selected Finance accounts',children:cashRows},
      operatingBalance:{label:'Current balance',amount:daily.availableOperatingCash,note:'Current balance across the account scope selected above.',source:'Selected Finance accounts',children:cashRows},
      todayInflows:{label:'Expected inflows today / tomorrow',amount:sum(todayIncome),source:'Scheduled transactions',children:todayIncome},
      todayObligations:{label:'Obligations due today / tomorrow',amount:sum(todayExpenses),source:'Scheduled transactions',children:todayExpenses},
      approvedDiscretionary:{label:'Approved discretionary amount',amount:approvedDiscretionary,note:'Remaining discretionary budget divided across the remaining days in the month.',source:'Budget + posted spending',children:[]},
      weekInflows:{label:'Expected inflows this week',amount:sum(weekIncome),source:'Scheduled transactions',children:weekIncome},
      weekObligations:{label:'Obligations this week',amount:sum(weekExpenses),source:'Scheduled transactions',children:weekExpenses},
      monthForecast:{label:'Projected month-end net cash flow',amount:monthly.cashFlow,note:'Scheduled monthly income minus scheduled recurring expenses.',source:'Finance forecast',children:[{label:'Income',amount:monthly.income,children:scheduledMonth.income},{label:'Expenses',amount:monthly.recurringExpenses,children:scheduledMonth.expenses}]},
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
