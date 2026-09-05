import { buildDailyAlignmentSnapshot } from './dailyAlignmentData.js'
import { calculateMonthlyCashFlow, calculateScheduledTotalsForMonth, calculateTransactionAmountForMonth } from './monthlyCashFlow.js'
import { addDays, toISO, txOccursOnDate } from './projection.js'
import { transactionDirection } from './reportingData.js'

const money=value=>Math.abs(Number(value)||0)
const nameOf=tx=>tx?.name||tx?.merchant_name||tx?.merchantName||tx?.description||'Transaction'
const metaOf=tx=>[tx?.date,tx?.category||tx?.cat,tx?.accountName].filter(Boolean).join(' · ')
const sum=rows=>rows.reduce((total,row)=>total+money(row.amount),0)

function scheduledRows(transactions=[],startDate,days=7,type){
  const rows=[]
  for(let offset=0;offset<days;offset+=1){
    const date=addDays(startDate,offset)
    for(const transaction of transactions){
      if(transaction?.type!==type||!txOccursOnDate(transaction,date)) continue
      rows.push({id:`${type}-${transaction.id||nameOf(transaction)}-${toISO(date)}`,label:nameOf(transaction),amount:money(transaction.amount),meta:[toISO(date),transaction.cat].filter(Boolean).join(' · ')})
    }
  }
  return rows
}

function actualMonth(actuals=[],today){
  const dateKey=toISO(today), month=dateKey.slice(0,7)
  const rows=actuals.filter(tx=>tx?.date?.startsWith(month)&&tx.date<=dateKey&&transactionDirection(tx)!=='transfer')
  return {
    income:rows.filter(tx=>transactionDirection(tx)==='income').map(tx=>({id:tx.id,label:nameOf(tx),amount:money(tx.amount),meta:metaOf(tx)})),
    expenses:rows.filter(tx=>transactionDirection(tx)==='expense').map(tx=>({id:tx.id,label:nameOf(tx),amount:money(tx.amount),meta:metaOf(tx)})),
  }
}

function projectedMonth(transactions=[],today){
  const income=[], expenses=[]
  for(const transaction of transactions){
    if(transaction?.type==='transfer') continue
    const amount=calculateTransactionAmountForMonth(transaction,today,{recurringOnly:false})
    if(!amount) continue
    const row={id:transaction.id,label:nameOf(transaction),amount:money(amount),meta:transaction.cat||'Scheduled'}
    if(transaction.type==='income') income.push(row)
    else if(transaction.type==='expense') expenses.push(row)
  }
  return {income,expenses}
}

export function buildCanonicalFinanceModel({accounts=[],scheduled=[],cashFlowScheduled,actuals=[],budget={},projection,today=new Date()}={}){
  const projectedSource=cashFlowScheduled||scheduled
  const dateKey=toISO(today)
  const daily=buildDailyAlignmentSnapshot({date:dateKey,accounts,scheduled,monthlyScheduled:projectedSource,actuals,budget,projectedBalance:projection?.get?.(dateKey)?.bal})
  const actual=actualMonth(actuals,today), projected=projectedMonth(projectedSource,today)
  const actualIncome=sum(actual.income), actualExpenses=sum(actual.expenses), actualNet=actualIncome-actualExpenses
  const projectedIncome=sum(projected.income), projectedExpenses=sum(projected.expenses), projectedNet=projectedIncome-projectedExpenses
  const weekIncome=scheduledRows(scheduled,today,7,'income'), weekExpenses=scheduledRows(scheduled,today,7,'expense')
  const nearIncome=scheduledRows(scheduled,today,2,'income'), nearExpenses=scheduledRows(scheduled,today,2,'expense')
  const recurring=calculateMonthlyCashFlow(projectedSource,today)
  const forecast=calculateScheduledTotalsForMonth(projectedSource,today,{recurringOnly:false})
  const cashRows=accounts.map(account=>({id:account.id,label:account.name||account.accountName||'Account',amount:Number(account.available??account.availableBalance??account.balance??account.current??account.currentBalance??0),meta:`Current ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(account.balance??account.current??account.currentBalance??0))}`}))
  const approvedDiscretionary=Math.max(Number(daily.approvedDiscretionary)||0,0)

  const metrics={
    actualMonthlyIncome:actualIncome, actualMonthlyExpenses:actualExpenses, actualMonthlyNet:actualNet,
    projectedMonthlyIncome:projectedIncome, projectedMonthlyExpenses:projectedExpenses, projectedMonthlyNet:projectedNet,
    operatingBalance:daily.availableOperatingCash, operatingAvailable:daily.availableOperatingCash,
    todayInflows:daily.expectedInflows, todayObligations:daily.dueTodayTomorrow, approvedDiscretionary,
    weekInflows:sum(weekIncome), weekObligations:sum(weekExpenses), monthForecast:forecast.net,
    recurringMonthlyNet:recurring.cashFlow,
  }

  return {
    metrics,
    breakdowns:{actual,projected,weekIncome,weekExpenses,nearIncome,nearExpenses,cashRows},
    sources:{daily,forecast,recurring},
  }
}
