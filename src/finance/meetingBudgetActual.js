import {budgetReport} from './meetingPackets.js'
import {isTransferTransaction,isRealizedIncomeTransaction,budgetCategoryForTransaction} from './reportingData.js'
import {categorizeExpenses} from './expenseCategorization.js'
export function budgetActualMatches(row,direction='all',filter='all',threshold=50){
 if(direction!=='all'&&row.direction!==direction)return false
 if(filter==='missing')return row.budget==null
 if(filter==='all')return true
 if(row.posted==null||row.budget==null)return false
 if(filter==='over')return row.posted>row.budget
 return row.budget>0&&Math.round(row.posted*100)*100>Math.round(row.budget*100)*Number(threshold)
}
export function meetingBudgetActual(data,month,asOf){
 const from=month+'-01',end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10),to=end<asOf?end:asOf
 const accounts=data.accounts||[],ids=new Map()
 for(const a of accounts)if(a.plaidAccountId)ids.set(a.plaidAccountId,(ids.get(a.plaidAccountId)||0)+1)
 const linked=accounts.length>0&&accounts.every(a=>a.plaidAccountId&&ids.get(a.plaidAccountId)===1)
 const transactions=categorizeExpenses(data.actuals||[],{scheduled:data.scheduled||[],budget:data.budget||{}}).filter(t=>ids.get(t.accountId)===1&&!t.pending&&!t._deleted&&!isTransferTransaction(t)&&Number.isFinite(Number(t.amount))&&t.date>=from&&t.date<=to)
 const available=linked&&(transactions.length>0||data.transactionFreshnessStatus==='fresh')
 const grouped=new Map()
 for(const account of accounts)for(const direction of ['expense','income']){
  const accountRows=budgetReport({scheduled:data.scheduled||[],budget:data.budget||{},accounts:[account],period:{from,to:end},posted:transactions.filter(t=>t.accountId===account.plaidAccountId),legacyYear:data.budgetLegacyYear,legacyAccountId:data.budgetLegacyAccountId,direction})
  if(direction==='expense')for(const limit of Object.values(data.budget?.categoryLimits||{}).filter(l=>l.accountId===account.id&&l.month===month)){
   let row=accountRows.find(r=>r.category.toLowerCase()===limit.category.toLowerCase())
   if(!row){row={category:limit.category,posted:0};accountRows.push(row)}
   row.budget=Number(limit.amount);row.displayName=limit.displayName||limit.category
  }
  for(const row of accountRows){const key=direction+':'+row.category,prior=grouped.get(key);grouped.set(key,{...row,direction,budget:prior?(prior.budget==null||row.budget==null?null:prior.budget+row.budget):row.budget,posted:available?(prior?.posted||0)+row.posted:null})}
 }
 const rows=[...grouped.values()]

 const category=t=>Number(t.amount)<0?'Income':budgetCategoryForTransaction(t)||'Uncategorized'
 return {rows,transactions:transactions.map(t=>({...t,reportCategory:category(t),direction:Number(t.amount)<0?'income':'expense'})),unclassified:transactions.filter(t=>Number(t.amount)>0&&/^(uncategorized|unclassified|unknown)$/i.test(category(t))),available,from,to,end,otherInflows:transactions.filter(t=>Number(t.amount)<0&&!isRealizedIncomeTransaction(t)).reduce((n,t)=>n-Number(t.amount),0)}
}
