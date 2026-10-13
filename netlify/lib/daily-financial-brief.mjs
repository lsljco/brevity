import {buildOutstandingCashForecast} from '../../src/finance/outstandingCashForecast.js'
import {txOccursOnDate,parseISODate} from '../../src/finance/projection.js'
const finite=value=>typeof value==='number'&&Number.isFinite(value)
const sum=values=>values.length&&values.every(finite)?Math.round(values.reduce((a,b)=>a+b,0)*100)/100:null
export function dailyFinancialBrief({date,finance,actuals,updatedAt='',plan={},sources={}}){
 const accounts=Array.isArray(finance?.accounts)?finance.accounts.filter(account=>['checking','savings'].includes(account.type)):[]
 const bank=account=>finite(account.plaidCurrentBalance)?account.plaidCurrentBalance:null
 const operating=accounts.filter(account=>account.type==='checking'&&(account.id==='a1'||/\boperating\b/i.test(account.name||'')))
 const savings=accounts.filter(account=>account.type==='savings')
 const monthEnd=new Date(`${date.slice(0,7)}-01T12:00:00Z`);monthEnd.setUTCMonth(monthEnd.getUTCMonth()+1,0)
 const endingDate=monthEnd.toISOString().slice(0,10),alerts=[]
 const verified=accounts.length>0&&accounts.every(account=>finite(bank(account))&&account.plaidAccountId)&&new Set(accounts.map(account=>account.plaidAccountId)).size===accounts.length&&Array.isArray(actuals)&&Array.isArray(finance?.transactions)
 let point=null,ending=null
 if(verified){const projection=buildOutstandingCashForecast(accounts,finance.transactions,actuals,{today:date,days:40,pastDays:40,reconcile:true});point=projection.get(date);ending=projection.get(endingDate)?.bal??null;if(!finite(ending))ending=null}
 else alerts.push('The bank balance or transaction source is incomplete. A reconciled month-end forecast is unavailable.')
 if(!updatedAt||Date.parse(date+'T12:00:00Z')-Date.parse(updatedAt)>86400000)alerts.push('Stored financial data may be out of date. Check the source timestamp in Finance.')
 if(ending!==null&&ending<0)alerts.push('Projected cash is below zero at month end. Review upcoming income and bills.')
 if(point?.pendingExcluded)alerts.push('Some pending activity could not be applied to a verified ledger balance.')
 const bills=(Array.isArray(finance?.transactions)?finance.transactions:[]).filter(item=>item.type==='expense'&&accounts.some(account=>account.id===item.acct)&&txOccursOnDate(item,parseISODate(date))).map(item=>{const match=point?.realization?.find(row=>row.id===item.id);return {id:item.id,title:item.name,amount:Number(item.amount),status:match?.statuses.every(row=>row.status==='posted')?'Posted':match?.statuses.some(row=>row.status==='pending')?'Pending':'Expected'}})
 const tasks=[...(plan.assignments||[]).filter(item=>item.pillar==='finance'&&(!item.date||item.date===date)),...(plan.finance?.bills||[]),...(plan.finance?.accountsToFund||[]),...(plan.finance?.transfers||[])].filter(item=>item&&typeof item==='object'&&(!item.date||item.date===date)&&!['complete','completed','done','cancelled','deferred'].includes(String(item.status).toLowerCase())).map(item=>({id:item.id,title:item.title||item.name||'Financial task',owner:item.owner||'Owner to confirm',time:item.startTime||''}))
 return {date,operatingBalance:sum(operating.map(bank)),savingsBalance:sum(savings.map(bank)),accounts:accounts.map(account=>({id:account.id,name:account.name,balance:bank(account),type:account.type})),projectedMonthEnd:ending,endingDate,currentCash:sum(accounts.map(bank)),bills,tasks,alerts,updatedAt,sources,notice:'Latest stored bank current balances, not a new live bank check. Projection includes pending and unmatched planned cash flows once, using the same reconciliation as Cash Forecast. Internal transfers between included cash accounts net to zero. Scheduled bills are not proof of payment.'}
}
