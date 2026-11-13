import {isCategoryAllowancePlan} from './categoryAllowancePlans.js'
import {calculateTransactionAmountForMonth} from './monthlyCashFlow.js'
import {buildAutoReconciliationReport} from './autoReconciliation.js'
import {budgetCategoryForTransaction,isTransferTransaction} from './reportingData.js'
import {buildUniquePlaidAccountMap} from './calendarSemantics.js'
const cents=v=>Math.round(Number(v||0)*100)
export function applyPooledCashAllowances(projection,{accounts,scheduled,actuals,budget={},today,explicitGroups=new Set()}) {
 // A grocery budget is a scheduled expense, not a pool to net against purchases.
 // Keep category actuals in budget reporting without rewriting the cash schedule.
 const isPool=p=>isCategoryAllowancePlan(p)&&!/^groceries(?: budget| allowance)?$/i.test(String(p.name||'').trim().replace(/\s+/g,' '))
 const pools=scheduled.filter(isPool)
 if(!pools.length)return projection
 const links=buildUniquePlaidAccountMap(accounts),months=[...new Set([...projection.keys()].filter(d=>d>=today).map(d=>d.slice(0,7)))],groups=new Map()
 for(const month of months)for(const plan of pools){if(!accounts.some(a=>a.id===plan.acct)||explicitGroups.has(`${plan.acct}|${plan.cat}`)||Object.values(budget.categoryLimits||{}).some(e=>e.accountId===plan.acct&&e.category===plan.cat&&e.month===month))continue;const key=`${plan.acct}|${month}|${plan.cat}`,g=groups.get(key)||{accountId:plan.acct,category:plan.cat,month,target:0,spent:0};g.target+=cents(calculateTransactionAmountForMonth(plan,new Date(`${month}-01T12:00:00`)));groups.set(key,g)}
 const unique=[...new Map(actuals.filter(t=>t.id&&!t._deleted&&t.date<=today).map(t=>[t.id,t])).values()],replaced=new Set(unique.filter(t=>!t.pending).map(t=>t.pendingTransactionId).filter(Boolean))
 const matchedBills=new Set(buildAutoReconciliationReport({accounts,scheduled:scheduled.filter(p=>!isCategoryAllowancePlan(p)),actuals:unique,today,lookbackDays:32,allowAmountVariance:true}).suggestions.map(m=>m.actual.id))
 for(const t of unique){if(Number(t.amount)<=0||isTransferTransaction(t)||t.pending&&replaced.has(t.id)||matchedBills.has(t.id))continue;const cat=budgetCategoryForTransaction({...t,pending:false})||'Uncategorized',g=groups.get(`${links[t.accountId]}|${String(t.date).slice(0,7)}|${cat}`);if(g)g.spent+=cents(t.amount)}
 // Keep category spending on its scheduled dates. Earlier purchases consume
 // the earliest remaining capacity, but never constitute a bank match.
 for(const g of groups.values()) {
  g.remaining=Math.max(0,g.target-g.spent)
  g.future=0
  for(const [date,point] of projection)if(date>=today&&date.startsWith(g.month))for(const p of point.txns||[])if(isPool(p)&&p.acct===g.accountId&&p.cat===g.category)g.future+=cents(p.amount)
  g.consume=Math.max(0,g.future-g.remaining)
 }
 let offset=0
 for(const [date,point] of projection){
  if(date<today)continue
  let adjustment=0
  const realization=(point.realization||[]).map(r=>{
   const plan=point.txns.find(p=>p.id===r.id)
   const g=plan&&isPool(plan)&&groups.get(`${plan.acct}|${date.slice(0,7)}|${plan.cat}`)
   if(!g)return r
   const used=Math.min(cents(plan.amount),g.consume);g.consume-=used
   const delta=-(cents(plan.amount)-used)
   adjustment+=delta-cents(r.delta)
   return {...r,delta:delta/100,statuses:[{status:'category-allowance',consumedAmount:used/100}],categoryAllowance:true}
  })
  offset+=adjustment
  projection.set(date,{...point,realization,remainingDelta:(cents(point.remainingDelta)+adjustment)/100,bal:(cents(point.bal)+offset)/100})
 }
 return projection
}
