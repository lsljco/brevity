import {getHouseholdDateKey} from './financeTime.js'
import { buildUniquePlaidAccountMap } from './calendarSemantics.js'
import { buildBudgetLines, buildLegacyBudgetOwners, budgetTargetForLine } from './budgetBreakdown.js'
import { budgetCategoryForTransaction, isTransferTransaction, isRealizedIncomeTransaction } from './reportingData.js'
import { approvedReconciliationMatches } from './autoReconciliation.js'

const cents = value => Math.round(Number(value) * 100)
const dollars = value => value / 100
const categories = new Set(['Housing','Utilities','Transportation','Insurance','Health','Debt','Food','Household','Family','Subscriptions','Discretionary','Other'])
export const spendingCategory = row => categories.has(row.category || row.cat) ? row.category || row.cat : budgetCategoryForTransaction({...row,pending:false}) || 'Other'
export const SPENDING_LABELS = {unbudgeted:'Unbudgeted',over:'Over budget',review:'Needs review',budgeted:'Budgeted',planned:'Planned and budgeted'}

// Same evidence and classifications for the review workspace and all five
// meeting cadences. Daily/weekly reports allocate against the full month;
// earlier spending consumes the allowance before the requested report starts.
export function buildSpendingAccountability({accounts=[],scheduled=[],actuals=[],budget={},period={},reviews={},budgetLegacyYear,budgetLegacyAccountId,today=getHouseholdDateKey()}={}) {
  const links=buildUniquePlaidAccountMap(accounts), accountIds=new Set(accounts.map(a=>a.id))
  const lines=buildBudgetLines(scheduled,budget,{accountIds}),owners=buildLegacyBudgetOwners(lines)
  const targets=new Map(),monthly=new Map(),used=new Map()
  const startMonth=String(period.from||'').slice(0,7),endMonth=String(period.to||'').slice(0,7)
  if(!/^\d{4}-\d{2}$/.test(startMonth)||!/^\d{4}-\d{2}$/.test(endMonth)||startMonth>endMonth)return {rows:[],pending:[],totals:{unbudgeted:0,over:0,review:0},categories:[],merchants:[],bridge:null,notice:'Select a valid report period.'}
  let missingTargets=0,incomeTarget=0,expenseTarget=0,incomeLines=0
  for(let date=new Date(`${startMonth}-01T12:00:00Z`);date.toISOString().slice(0,7)<=endMonth;date.setUTCMonth(date.getUTCMonth()+1)) {
    const month=date.toISOString().slice(0,7),year=date.getUTCFullYear(),index=date.getUTCMonth()
    for(const line of lines){
      const original=budget.originalTargets?.[line.accountId]?.[String(year)]?.[line.id]
      const target=original && Object.prototype.hasOwnProperty.call(original,index) ? original[index] : budgetTargetForLine({budget,line,year,month:index,legacyYear:budgetLegacyYear,legacyAccountId:budgetLegacyAccountId,legacyOwners:owners})
      if(target===null||target===undefined||target===''){missingTargets++;continue}
      const amount=Math.max(0,cents(target))
      if(line.direction==='income'){incomeTarget+=amount;incomeLines++;continue}
      expenseTarget+=amount
      const category=spendingCategory({category:line.category,amount:1}),key=`${line.accountId}|${month}|${category}`
      targets.set(key,(targets.get(key)||0)+amount)
    }
  }
  const unique=[...new Map(actuals.filter(t=>t?.id&&!t._deleted).map(t=>[t.id,t])).values()]
  const superseded=new Set(unique.filter(t=>!t.pending).map(t=>t.pendingTransactionId).filter(Boolean))
  const raw=unique.filter(t=>/^\d{4}-\d{2}-\d{2}$/.test(t.date||'')&&t.date>=`${startMonth}-01`&&t.date<=period.to&&Number.isFinite(Number(t.amount))&&!isTransferTransaction(t)&&t.type!=='transfer'&&(!t.pending||!superseded.has(t.id))).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
  const rows=[],pending=[];let postedIncome=0,otherInflows=0,postedSpending=0
  const totals={unbudgeted:0,over:0,review:0},merchants=new Map()
  for(const t of raw){
    const accountId=links[t.accountId],inPeriod=t.date>=period.from,amount=cents(t.amount)
    // Include unmapped source records as explicit review items, never silently
    // assign their spending to an unrelated selected account.
    if(accountId&&!accountIds.has(accountId))continue
    if(amount<=0){if(inPeriod&&!t.pending&&accountId){if(isRealizedIncomeTransaction(t))postedIncome-=amount;else otherInflows-=amount}continue}
    const category=spendingCategory(t),key=`${accountId}|${t.date.slice(0,7)}|${category}`,target=targets.get(key)||0
    const before=used.get(key)||0
    const needsReview=!accountId||category==='Other'
    const exception=needsReview?'review':target<=0?'unbudgeted':before+amount>target?'over':scheduled.some(plan=>approvedReconciliationMatches(plan,t,t.date,links))?'planned':'budgeted'
    const excess=exception==='over'?Math.max(0,before+amount-target)-Math.max(0,before-target):['review','unbudgeted'].includes(exception)?amount:0
    const review=reviews[t.id]||null
    const row={...t,accountId:accountId||'',bankAccountId:t.accountId,accountName:accounts.find(a=>a.id===accountId)?.name||'Unmapped account',category,classification:exception,amount:dollars(amount),exceptionAmount:dollars(excess),budget:dollars(target),monthSpent:dollars(before+amount),review,name:t.merchant_name||t.name||'Unidentified merchant',reason:!accountId?'Account link needs review':category==='Other'?'Category needs review':target<=0?'No approved allocation':exception==='over'?'Monthly category allowance exceeded':'Covered by monthly category allowance'}
    if(t.pending){if(inPeriod)pending.push(row);continue}
    used.set(key,before+amount)
    if(!inPeriod)continue
    if(accountId)postedSpending+=amount
    rows.push(row)
    if(Object.hasOwn(totals,exception))totals[exception]+=excess
    const cat=monthly.get(category)||{category,spent:0,unbudgeted:0,over:0,review:0};cat.spent+=amount;if(Object.hasOwn(totals,exception))cat[exception]+=excess;monthly.set(category,cat)
    if(excess>0){const merchantKey=row.name.toLowerCase(),m=merchants.get(merchantKey)||{name:row.name,amount:0,count:0,transactionIds:[],months:new Set()};m.amount+=excess;m.count++;m.transactionIds.push(t.id);m.months.add(t.date.slice(0,7));merchants.set(merchantKey,m)}
  }
  const fullMonths=period.from.endsWith('-01')&&new Date(`${period.to}T12:00:00Z`).getUTCDate()===new Date(Number(period.to.slice(0,4)),Number(period.to.slice(5,7)),0).getDate()
  const linked=accounts.length>0&&Object.keys(links).length===accounts.length
  // This is a net-cash-flow comparison, not proof of deposits into savings.
  // Favorable variances remain negative and the residual is explicit.
  const bridge=incomeLines&&missingTargets===0&&linked&&fullMonths&&period.to<today?{
    target:dollars(incomeTarget-expenseTarget),actual:dollars(postedIncome+otherInflows-postedSpending),
    gap:dollars(incomeTarget-expenseTarget-postedIncome-otherInflows+postedSpending),
    income:dollars(incomeTarget-postedIncome),unbudgeted:dollars(totals.unbudgeted),
    budgetedVariance:dollars(postedSpending-totals.unbudgeted-expenseTarget),otherInflows:dollars(-otherInflows),unexplained:0,
  }:null
  return {rows,pending,totals:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,dollars(v)])),categories:[...monthly.values()].map(r=>({...r,spent:dollars(r.spent),unbudgeted:dollars(r.unbudgeted),over:dollars(r.over),review:dollars(r.review)})),merchants:[...merchants.values()].map(m=>({...m,amount:dollars(m.amount),months:m.months.size,recurring:m.months.size>=2})).sort((a,b)=>b.amount-a.amount),bridge,missingTargets,postedIncome:dollars(postedIncome),postedSpending:dollars(postedSpending),otherInflows:dollars(otherInflows),notice:'Posted spending only; pending charges are separate. Overruns use the full monthly allowance and prior spending in that month. Reviewed exceptions remain in totals. Original approved targets are preserved; missing allocations are flagged for review.'}
}
