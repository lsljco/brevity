import {buildOutstandingCashForecast} from './outstandingCashForecast.js'
import {isTransferTransaction} from './reportingData.js'
import {buildUniquePlaidAccountMap} from './calendarSemantics.js'
const round=n=>Math.round(n*100)/100
export function dashboardMonthOutlook({accounts=[],scheduled=[],actuals=[],month,today,projection}){
 const from=month+'-01',end=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).toISOString().slice(0,10),cutoff=end<today?end:today,links=buildUniquePlaidAccountMap(accounts),days=(a,b)=>Math.ceil((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000)
 const scoped=[...new Map(actuals.filter(t=>t.id&&links[t.accountId]&&!t._deleted&&Number.isFinite(Number(t.amount))&&t.date<=today).map(t=>[t.id,t])).values()],superseded=new Set(scoped.filter(t=>!t.pending).map(t=>t.pendingTransactionId).filter(Boolean)),bank=scoped.filter(t=>!superseded.has(t.id)&&!isTransferTransaction(t)),posted=bank.filter(t=>!t.pending&&t.date>=from&&t.date<=cutoff),pending=bank.filter(t=>t.pending&&t.date>=from&&t.date<=end),plans=scheduled.filter(t=>!isTransferTransaction(t))
 const forecast=buildOutstandingCashForecast(accounts,plans,scoped,{today,days:Math.max(1,days(end,today)),pastDays:Math.max(14,days(today,from)+7),reconcile:true})
 const sum=(rows,positive)=>round(rows.filter(t=>positive?Number(t.amount)<0:Number(t.amount)>=0).reduce((n,t)=>n+Math.abs(Number(t.amount)),0))
 const actual={income:sum(posted,true),expense:sum(posted,false)};actual.net=round(actual.income-actual.expense)
 const remaining={income:0,expense:0},original={income:0,expense:0},expected=[],overdue=[]
 for(const [date,p] of forecast){if(date<from||date>end)continue;for(const t of p.txns||[])if(t.type==='income'||t.type==='expense')original[t.type==='income'?'income':'expense']+=Number(t.amount||0)
 if(end<today)continue
 for(const r of p.realization||[]){if(!r.delta)continue;const row={date,name:r.name,delta:r.delta,status:date<today?'Overdue · unconfirmed':'Expected'};expected.push(row);if(date<today)overdue.push(row);remaining[r.delta>0?'income':'expense']+=Math.abs(r.delta)}}
 if(end>=today)for(const t of pending){remaining[Number(t.amount)<0?'income':'expense']+=Math.abs(Number(t.amount));expected.push({date:t.date,name:t.name||t.merchant_name,delta:-Number(t.amount),status:'Pending'})}
 for(const totals of [remaining,original]){totals.income=round(totals.income);totals.expense=round(totals.expense);totals.net=round(totals.income-totals.expense)}
 const outlook={income:round(actual.income+remaining.income),expense:round(actual.expense+remaining.expense),net:round(actual.net+remaining.net)}
 const current=accounts.reduce((n,a)=>n+Number(a.plaidAvailableBalance??a.plaidCurrentBalance??a.balance??0),0)
 // Keep the canonical balance: historical unmatched plans are not new cash activity.
 const projectedEnd=(projection||forecast).get(end)?.bal
 const endBalance=month===today.slice(0,7)&&accounts.length&&Number.isFinite(projectedEnd)?projectedEnd:null
 const overdueNet=round(overdue.reduce((sum,row)=>sum+row.delta,0))
 const endBalanceProvisional=Number.isFinite(endBalance)&&overdue.length>0
 return {from,end,cutoff,actual,remaining,original,outlook,posted,expected,overdue,overdueNet,current:round(current),endBalance,endBalanceProvisional}
}
export function outlookSeries(model,today){
 const points=[],start=new Date(model.from+'T12:00:00Z'),finish=new Date(model.end+'T12:00:00Z');let actual=0,expected=0
 for(let d=start;d<=finish;d.setUTCDate(d.getUTCDate()+1)){const date=d.toISOString().slice(0,10);actual+=model.posted.filter(t=>t.date===date).reduce((n,t)=>n-Number(t.amount),0);expected+=model.expected.filter(t=>(t.date<today?today:t.date)===date).reduce((n,t)=>n+t.delta,0);points.push({date,actual:round(actual),outlook:round(actual+expected)})}
 return points
}
