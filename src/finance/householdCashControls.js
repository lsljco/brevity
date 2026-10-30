import {buildUniquePlaidAccountMap} from './calendarSemantics.js'
import {buildAutoReconciliationReport} from './autoReconciliation.js'
import {isTransferTransaction} from './reportingData.js'

export function operatingSpendingSources(source={}){
 const accounts=source.accounts||[]
 const operating=accounts.find(a=>/\boperating\b/i.test(a.name||''))||accounts.find(a=>a.id===source.budgetLegacyAccountId)
 const map=buildUniquePlaidAccountMap(operating?[operating]:[])
 return {...source,accounts:operating?[operating]:[],scheduled:(source.scheduled||[]).filter(t=>t.acct===operating?.id),actuals:(source.actuals||[]).filter(t=>map[t.accountId]===operating?.id&&Boolean(operating)),scopeLabel:operating?`${operating.name} only; personal account activity excluded`:'Operating account not identified; household spending unavailable'}
}

// Exceptions are evidence for investigation, never assertions of misconduct or
// permission to cancel a draft, pay a bill, or move money.
export function householdCashControls(source={},period={}){
 const scoped=operatingSpendingSources(source),from=period.from||source.period?.from,to=period.to||source.period?.to
 const available=Boolean(scoped.accounts.length)&&Boolean(from&&to)&&(source.transactionFreshnessStatus==='fresh'||(source.actuals||[]).length>0)
 const unique=[...new Map(scoped.actuals.filter(t=>t.id&&!t._deleted).map(t=>[t.id,t])).values()]
 const replaced=new Set(unique.filter(t=>!t.pending).map(t=>t.pendingTransactionId).filter(Boolean))
 const posted=unique.filter(t=>!t.pending&&!replaced.has(t.id)&&t.date>=from&&t.date<=to&&Number.isFinite(Number(t.amount)))
 const assessment=available?buildAutoReconciliationReport({...scoped,actuals:posted,today:to,lookbackDays:Math.ceil((new Date(to)-new Date(from))/86400000)+1,allowAmountVariance:true}):{suggestions:[]}
 const matched=new Map((assessment.suggestions||[]).map(s=>[s.actual.id,s]))
 const rows=[];let dividendCents=0
 for(const t of posted){
  const amount=Number(t.amount),text=`${t.merchant_name||''} ${t.name||''} ${t.originalStatement||''}`,match=matched.get(t.id)
  if(t.managementCategory==='Dividend Expense'&&amount>0)dividendCents+=Math.round(amount*100)
  if(amount<=0)continue
  let reason=''
  if(/dining|coffee|snacks/i.test(t.category||'')||/starbucks|chick.?fil.?a|dunkin|honey.?baked|mcdonald|restaurant/i.test(text))reason='Dining or personal-spending indicator in Operating. Confirm purpose and use the personal spending allowance for future personal purchases.'
  else if(isTransferTransaction(t)&&!match)reason='Transfer or card settlement without a unique matching plan. Confirm recipient, purpose and prior approval; do not count it twice as spending.'
  else if(match&&Math.abs(amount-Number(match.plan.amount))>.01)reason='Creditor or planned payment differs from its saved amount. Compare the statement and payment authorization.'
  if(reason)rows.push({id:t.id,date:t.date,name:t.merchant_name||t.name||'Bank activity',amount,reason,plannedAmount:match?Number(match.plan.amount):null})
 }
 return {available,scopeLabel:scoped.scopeLabel,from,to,exceptionCount:available?rows.length:null,exceptions:rows,dividendExpense:available?dividendCents/100:null,credits:posted.filter(t=>Number(t.amount)<0).map(t=>({id:t.id,date:t.date,name:t.merchant_name||t.name,amount:-Number(t.amount)})),allowance:{perAdultPerWeek:50,weekday:'Friday',status:'Policy target; bank transfers and adult eligibility must be confirmed. No bank automation is configured by this report.'},notice:'Exceptions are review indicators, not confirmed unauthorized payments. Credits remain separate dated evidence; a credit is not automatically a refund for a particular debit. Imported history may be incomplete.'}
}
