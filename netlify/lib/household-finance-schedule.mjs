import {transactionOccurrencesForRange} from '../../src/finance/monthlyCashFlow.js'
import {parseISODate,toISO,addDays} from '../../src/finance/projection.js'

// Reuse Finance's recurrence rules; a scheduled occurrence is not a payment.
export function householdFinanceSchedule(finance,date,{updatedAt='',state='available'}={}){
 const start=parseISODate(date)
 if(state!=='available'||!start||!Array.isArray(finance?.transactions))return {state:state==='available'?'unavailable':state,asOfDate:date,updatedAt,notice:'Scheduled finance records are unavailable; do not infer that no bills or income are due.'}
 const through=toISO(addDays(start,6))
 const items=finance.transactions.filter(item=>item&&['expense','income'].includes(item.type)&&item.amount!==null&&item.amount!==''&&Number.isFinite(Number(item.amount))).flatMap(item=>transactionOccurrencesForRange(item,{from:date,to:through}).map(occurrence=>({id:item.id,title:String(item.name||item.title||'Untitled scheduled item').slice(0,240),type:item.type,date:occurrence.date,amount:occurrence.amount,status:'scheduled-unconfirmed',owner:item.owner||null}))).sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title))
 const summarize=rows=>({count:rows.length,amount:Math.round(rows.reduce((sum,item)=>sum+item.amount,0)*100)/100})
 return {state:'available',asOfDate:date,through,updatedAt,today:{expenses:summarize(items.filter(item=>item.date===date&&item.type==='expense')),income:summarize(items.filter(item=>item.date===date&&item.type==='income'))},sevenDays:{expenses:summarize(items.filter(item=>item.type==='expense')),income:summarize(items.filter(item=>item.type==='income'))},items:items.slice(0,40),omittedCount:Math.max(0,items.length-40),notice:'Saved scheduled expenses and expected income, not proof of payment, receipt or live bank balances. Internal transfers are excluded. Totals include every occurrence; the detail list may be abbreviated. A missing daily finance plan does not mean there are no financial obligations.'}
}
