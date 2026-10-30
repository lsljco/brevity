import {buildBudgetLines,buildLegacyBudgetOwners,budgetTargetForLine} from './budgetBreakdown.js'
import {budgetCategoryForTransaction,isTransferTransaction} from './reportingData.js'
import {buildUniquePlaidAccountMap} from './calendarSemantics.js'
const cents=v=>Math.round(Number(v||0)*100)
const category=t=>t.cat||budgetCategoryForTransaction({...t,pending:false})||t.category||'Uncategorized'

// Explicit category allowances reserve only the portion not represented by
// posted charges, pending holds or remaining scheduled payments. Current-month
// capacity is reserved today; future months reserve it on their first day.
export function applyBudgetAllowances(projection,{accounts,scheduled,actuals,budget,today}={}){
 if(!budget||!projection.size)return projection
 const allLines=buildBudgetLines(scheduled,budget,{accountIds:new Set(accounts.map(a=>a.id))}).filter(l=>l.direction==='expense')
 const enabled=new Set(allLines.filter(l=>budget.lines?.[l.id]?.cashAllowance).map(l=>`${l.accountId}|${l.category}`))
 const lines=allLines.filter(l=>enabled.has(`${l.accountId}|${l.category}`))
 if(!lines.length&&!Object.keys(budget.categoryLimits||{}).length)return projection
 const links=buildUniquePlaidAccountMap(accounts),owners=buildLegacyBudgetOwners(lines)
 const unique=[...new Map(actuals.filter(t=>t.id).map(t=>[t.id,t])).values()]
 const replaced=new Set(unique.filter(t=>!t.pending).map(t=>t.pendingTransactionId).filter(Boolean))
 const amounts=new Map(),reservations=new Map()
 for(const t of unique){if(!t.date||t.date>today||!links[t.accountId]||Number(t.amount)<=0||isTransferTransaction(t)||t.pending&&replaced.has(t.id))continue;const key=`${links[t.accountId]}|${t.date.slice(0,7)}|${category(t)}`;amounts.set(key,(amounts.get(key)||0)+cents(t.amount))}
 const months=[...new Set([...projection.keys()].filter(d=>d>=today).map(d=>d.slice(0,7)))]
 for(const month of months){
  const groups=new Map()
  for(const line of lines){const target=budgetTargetForLine({budget,line,year:Number(month.slice(0,4)),month:Number(month.slice(5,7))-1,legacyOwners:owners});if(!Number.isFinite(target)||target<=0)continue;const key=`${line.accountId}|${month}|${line.category}`;const group=groups.get(key)||{accountId:line.accountId,category:line.category,target:0};group.target+=cents(target);groups.set(key,group)}
  for(const entry of Object.values(budget.categoryLimits||{})){if(entry.month===month&&accounts.some(a=>a.id===entry.accountId)){const key=`${entry.accountId}|${month}|${entry.category}`;groups.set(key,{accountId:entry.accountId,category:entry.category,target:cents(entry.forecastAllocation)})}}
  for(const [key,group] of groups){let planned=0
   for(const [date,point] of projection){if(date<today||!date.startsWith(month))continue;for(const plan of point.txns||[]){if(plan.type!=='expense'||plan.acct!==group.accountId||category({...plan,amount:1})!==group.category)continue;const realized=point.realization?.find(r=>r.id===plan.id);planned+=realized?Math.max(0,-cents(realized.delta)):cents(plan.amount)}}
   const remaining=Math.max(0,group.target-(amounts.get(key)||0)-planned),date=month===today.slice(0,7)?today:`${month}-01`
   if(remaining&&projection.has(date)){const list=reservations.get(date)||[];list.push({accountId:group.accountId,category:group.category,amount:remaining/100});reservations.set(date,list)}
  }
 }
 let reserved=0
 for(const [date,point] of projection){if(date<today)continue;const allowances=reservations.get(date)||[];const delta=allowances.reduce((sum,r)=>sum+cents(r.amount),0);reserved+=delta;projection.set(date,{...point,bal:(cents(point.bal)-reserved)/100,budgetAllowances:allowances,budgetAllowanceDelta:-delta/100})}
 return projection
}
