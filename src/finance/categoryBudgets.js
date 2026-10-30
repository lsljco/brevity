import {isCategoryAllowancePlan} from './categoryAllowancePlans.js'
import {getHouseholdDateKey} from './financeTime.js'
import {txOccursOnDate} from './projection.js'
import {buildBudgetLines,buildLegacyBudgetOwners,budgetTargetForLine} from './budgetBreakdown.js'
import {calculateTransactionAmountForMonth} from './monthlyCashFlow.js'
import {budgetCategoryForTransaction,isTransferTransaction} from './reportingData.js'
import {buildUniquePlaidAccountMap} from './calendarSemantics.js'
import {buildAutoReconciliationReport,approvedReconciliationMatches} from './autoReconciliation.js'
export const categoryBudgetKey=(accountId,month,category)=>`${accountId}|${month}|${category.trim().toLowerCase()}`
export function categoryBudgetOperation({accountId,month,category,amount,forecastAllocation=0}) {
 let hash=2166136261;for(const character of categoryBudgetKey(accountId,month,category)){hash^=character.codePointAt(0);hash=Math.imul(hash,16777619)}
 const lineId=`category-budget:${(hash>>>0).toString(36)}`
 return {type:'budget.update',targetId:lineId,description:`Set ${category} budget to $${amount} and total forecast allocation to $${forecastAllocation} for ${month}.`,payload:{lineId,accountId,category,categoryLimit:true,direction:'expense',lineName:category,year:Number(month.slice(0,4)),month:Number(month.slice(5,7))-1,value:Number(amount),forecastAllocation:Number(forecastAllocation)}}
}
export function buildCategoryBudgetSummary({accounts=[],scheduled=[],actuals=[],budget={},month,legacyYear,legacyAccountId,today=getHouseholdDateKey()}) {
 const date=new Date(`${month}-01T12:00:00Z`),links=buildUniquePlaidAccountMap(accounts),ids=new Set(accounts.map(a=>String(a.id)))
 const lines=buildBudgetLines(scheduled,budget,{accountIds:ids}),owners=buildLegacyBudgetOwners(lines),groups=new Map()
 const allowanceGroups=new Set(lines.filter(l=>l.cashAllowance).map(l=>`${l.accountId}|${l.category}`))
 const get=(accountId,category)=>{const key=categoryBudgetKey(accountId,month,category);if(!groups.has(key))groups.set(key,{key,accountId,category,budget:0,scheduled:0,actual:0,settled:0,matchedActual:0,pooled:0,futureScheduled:0,forecastAllocation:0});return groups.get(key)}
 for(const line of lines.filter(l=>l.direction==='expense')){const g=get(line.accountId,line.category);const planned=line.transactions.reduce((s,t)=>s+calculateTransactionAmountForMonth(t,date),0);g.scheduled+=planned;for(const t of line.transactions){if(isCategoryAllowancePlan(t))g.pooled+=calculateTransactionAmountForMonth(t,date);else for(let day=1;day<=new Date(date.getUTCFullYear(),date.getUTCMonth()+1,0).getDate();day++){const d=new Date(date.getUTCFullYear(),date.getUTCMonth(),day);if(`${month}-${String(day).padStart(2,'0')}`>=today&&txOccursOnDate(t,d))g.futureScheduled+=Number(t.amount)}}const target=budgetTargetForLine({budget,line,year:date.getUTCFullYear(),month:date.getUTCMonth(),legacyYear,legacyAccountId,legacyOwners:owners});g.budget+=target??planned;if(allowanceGroups.has(`${line.accountId}|${line.category}`))g.forecastAllocation+=target||0}
 for(const entry of Object.values(budget.categoryLimits||{})){if(entry.month!==month||!ids.has(entry.accountId))continue;const g=get(entry.accountId,entry.category);g.budget=entry.amount;g.forecastAllocation=entry.forecastAllocation||0;g.explicit=true}
 const posted=[...new Map(actuals.filter(t=>t.id&&!t.pending&&!t._deleted&&String(t.date).startsWith(month)&&!isTransferTransaction(t)&&Number(t.amount)>0).map(t=>[t.id,t])).values()]
 const end=`${month}-${new Date(date.getUTCFullYear(),date.getUTCMonth()+1,0).getDate()}`
 const report=buildAutoReconciliationReport({accounts,scheduled,actuals:posted,today:end,lookbackDays:32,allowAmountVariance:true})
 const matched=new Map(report.suggestions.map(m=>[m.actual.id,{...m.plan,_matchedOccurrence:m.occurrenceDate}]))
 for(const t of posted){const approved=scheduled.find(p=>approvedReconciliationMatches(p,t,t.date,links));if(approved)matched.set(t.id,{...approved,_matchedOccurrence:t.date})}
 for(const t of posted){const mapped=links[t.accountId];if(mapped&&!ids.has(mapped))continue;const accountId=mapped||'unmapped';const candidate=matched.get(t.id),plan=['reviewed','rule'].includes(t._categorySource)&&t.category!==candidate?.cat?null:candidate,category=plan?.cat||budgetCategoryForTransaction(t)||'Uncategorized';const g=get(accountId,category);g.actual+=Number(t.amount);if(plan&&!isCategoryAllowancePlan(plan)){g.matchedActual+=Number(t.amount);if(plan._matchedOccurrence>=today)g.settled+=Number(plan.amount)}}
 const rows=[...groups.values()].map(g=>{const allocated=Math.max(g.scheduled,g.forecastAllocation);const remainingScheduled=Math.max(0,g.futureScheduled-g.settled)+Math.max(0,g.pooled-Math.max(0,g.actual-g.matchedActual));const remainingForecast=month<today.slice(0,7)?0:remainingScheduled+Math.max(0,g.forecastAllocation-g.actual-remainingScheduled);return {...g,needsCategory:g.category==='Uncategorized',allocated,remainingToAllocate:g.budget-allocated,remainingToSpend:g.budget-g.actual,remainingForecast,expectedOverrun:Math.max(0,g.actual+remainingForecast-g.budget)}})
 for(const row of rows)for(const key of ['budget','allocated','actual','remainingToAllocate','remainingToSpend','remainingForecast','expectedOverrun'])row[key]=Math.round(row[key]*100)/100
 const totals=rows.reduce((s,r)=>{for(const k of ['budget','allocated','actual','remainingToAllocate','remainingToSpend','remainingForecast','expectedOverrun'])s[k]=(s[k]||0)+r[k];return s},{})
 totals.expectedOverrun=Math.max(0,(totals.actual||0)+(totals.remainingForecast||0)-(totals.budget||0))
 return {rows,totals}
}
