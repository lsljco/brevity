import { transactionOccurrencesForRange } from './monthlyCashFlow.js'
import { summarizeActualCashActivity } from './reportingData.js'

// Sample cumulative totals from exactly the same range and ledger as the cards.
// Include both endpoints; a single-day selection has no invented trend.
export function buildMetricTrends({scheduled=[],actuals=[],range,posted=false}) {
 const start=Date.parse(`${range.from}T12:00:00Z`),end=Date.parse(`${range.to}T12:00:00Z`)
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return []
 const scheduledRows=posted?[]:scheduled.flatMap(tx=>['income','expense'].includes(tx.type)?transactionOccurrencesForRange(tx,range).map(row=>({...row,type:tx.type})):[])
 const days=Math.round((end-start)/86400000),count=Math.min(days+1,32)
 return Array.from({length:count},(_,i)=>{
  const date=new Date(start+Math.round(i*days/(count-1))*86400000).toISOString().slice(0,10)
  const totals=posted?summarizeActualCashActivity(actuals.filter(tx=>!tx.pending&&tx.date>=range.from&&tx.date<=date)):scheduledRows.filter(row=>row.date<=date).reduce((sum,row)=>{sum[row.type==='income'?'income':'expenses']+=row.amount;sum.net=sum.income-sum.expenses;return sum},{income:0,expenses:0,net:0})
  return {date,...totals}
 })
}
