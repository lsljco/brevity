import {transactionOccurrencesForRange} from './monthlyCashFlow.js'
import {budgetCategoryForTransaction,isRealizedIncomeTransaction,isTransferTransaction} from './reportingData.js'
import {categorizeExpenses} from './expenseCategorization.js'
export function budgetWeek(date){
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-d.getUTCDay());const from=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return {from,end:d.toISOString().slice(0,10)}
}
const normalized=s=>String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ')
export function weeklyBudgetActual(data,date,asOf){
 const {from,end}=budgetWeek(date),to=end<asOf?end:asOf,accounts=data.accounts||[],ids=new Set(accounts.map(a=>a.id)),bankIds=new Map()
 for(const a of accounts)if(a.plaidAccountId)bankIds.set(a.plaidAccountId,(bankIds.get(a.plaidAccountId)||0)+1)
 const linked=accounts.length>0&&accounts.every(a=>a.plaidAccountId&&bankIds.get(a.plaidAccountId)===1)
 const scheduled=(data.scheduled||[]).filter(t=>ids.has(t.acct)&&['income','expense'].includes(t.type)&&!isTransferTransaction(t))
 const transactions=[...new Map(categorizeExpenses(data.actuals||[],{scheduled,budget:data.budget||{}}).filter(t=>t.id&&!t.pending&&!t._deleted&&!isTransferTransaction(t)&&bankIds.get(t.accountId)===1&&Number.isFinite(Number(t.amount))&&t.date>=from&&t.date<=to).map(t=>[t.id,t])).values()].map(t=>({...t,direction:Number(t.amount)<0?'income':'expense',reportCategory:Number(t.amount)<0?'Income':budgetCategoryForTransaction(t)||'Uncategorized'}))
 const available=linked&&(transactions.length>0||data.transactionFreshnessStatus==='fresh'),groups=new Map(),items=[]
 const group=(category,direction)=>{const key=direction+':'+category;if(!groups.has(key))groups.set(key,{category,direction,budget:0,posted:available?0:null,planned:[]});return groups.get(key)}
 for(const plan of scheduled){const occurrences=transactionOccurrencesForRange(plan,{from,to:end});if(!occurrences.length)continue;const amount=occurrences.reduce((n,o)=>n+o.amount,0),category=plan.type==='income'?'Income':plan.cat||'Uncategorized',row=group(category,plan.type);row.budget+=amount;row.planned.push(...occurrences.map(o=>({name:plan.name,date:o.date,amount:o.amount})));items.push({id:plan.id,accountId:plan.acct,category:plan.name||category,direction:plan.type,budget:amount,posted:available?0:null,plan,transactionIds:[],planned:occurrences.map(o=>({name:plan.name,date:o.date,amount:o.amount}))})}
 for(const t of transactions){if(t.direction==='income'&&!isRealizedIncomeTransaction(t))continue;group(t.reportCategory,t.direction).posted+=Math.abs(Number(t.amount));const account=accounts.find(a=>a.plaidAccountId===t.accountId);const matches=items.filter(i=>i.plan&&i.accountId===account?.id&&i.direction===t.direction&&(t.vendorId&&i.plan.vendorId===t.vendorId||normalized(i.plan.name)===normalized(t.merchant_name||t.name)));if(matches.length===1){matches[0].posted+=Math.abs(Number(t.amount));matches[0].transactionIds.push(t.id)}else{items.push({id:'actual:'+t.id,category:t.name||t.merchant_name||'Unmatched actual',direction:t.direction,budget:null,posted:Math.abs(Number(t.amount)),transactionIds:[t.id],unmatched:true})}}
 return {rows:[...groups.values()].map(r=>({...r,posted:available?r.posted:null})),items:items.map(r=>({...r,posted:available?r.posted:null})),transactions,unclassified:transactions.filter(t=>t.direction==='expense'&&/^(uncategorized|unclassified|unknown)$/i.test(t.reportCategory)),available,from,to,end,weekly:true}
}
