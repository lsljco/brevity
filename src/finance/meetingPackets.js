import {getHouseholdCalendarDate, getHouseholdDateKey} from './financeTime.js'
import {toISO, addDays, parseISODate} from './projection.js'
import {isTransferTransaction, isRealizedIncomeTransaction, budgetCategoryForTransaction} from './reportingData.js'
import {transactionOccurrencesForRange} from './monthlyCashFlow.js'
import {buildBudgetLines, buildLegacyBudgetOwners, budgetTargetForLine} from './budgetBreakdown.js'
import {approvedReconciliationMatches} from './autoReconciliation.js'

// Policy content is shared by the live packet and its archived text snapshot.
export const MEETING_POLICIES = {
  daily:{label:'Daily',duration:'7–10 minutes',minutes:[2,2,2,2,1],
    agenda:['Prior-day opening / closing balances and current cash position','Review, assign and confirm actions; explicitly report deviations','Standing payables, milestones, reminders and financial due diligence','Pending charges, projected obligations and immediate exceptions','Confirm owners, deadlines and recap'],
    inputs:['Prior-day balance evidence','Posted ledger and pending charges','Standing obligations, milestones and open actions'],
    deliverables:['Daily cash and exception snapshot','Updated standing payables and action register','Immediate decisions with owners and deadlines']},
  weekly:{label:'Weekly',duration:'20–30 minutes',minutes:[6,5,4,6,4],
    agenda:['Week in review: Budget vs. Actual trends and annual-goal impact','Daily balances and week-over-week projections; standing payables','Positive / negative financial behaviors and spending leakage','Necessary adjustments and recovery recommendations, tactics and strategies','Action accountability and follow-up'],
    inputs:['Daily snapshots and weekly bank activity','Category budget and annual goals','Cash forecast, behavior deviations and open actions'],
    deliverables:['Weekly governance recap and Budget vs. Actual review','Updated week-over-week cash outlook','Recovery recommendations and accountable actions']},
  monthly:{label:'Monthly',duration:'45–60 minutes',minutes:[10,10,10,8,10,7],
    agenda:['Month-End Close Report and Monthly Operating Report','Reconcile every account; complete, review and communicate to all governing members','Budget vs. Actual and account-balance explanations','Month-over-month comparison and explanations','Strategic findings, non-compliant behaviors and quarterly success alignment','Decisions, owners, deadlines and report distribution'],
    inputs:['Month-end statements and reconciliation evidence for every account','Approved category budget and prior-month results','Debt/card statements, forecast, standing payables and actions'],
    deliverables:['Month-End Close Report and Monthly Operating Report','Full reconciliation reviewed and communicated to all governing members','Monthly variance explanations and month-over-month comparison','Quarterly alignment plan and action register']},
  quarterly:{label:'Quarterly',duration:'75–90 minutes',minutes:[20,15,15,20,15],
    agenda:['Quarter-End Close Report and Quarter-over-Quarter Operating Review','Month-over-month Budget vs. Actual and deviation explanations','Strategic findings and realignment for annual success','Budget review, true-up and following-year budget milestones','Standing payables, risks, decisions and accountable actions'],
    inputs:['Three monthly closes, reconciliations and prior-quarter results','Monthly budget targets and annual outlook','Investment, insurance and project schedules; following-year proposal at Q3 close'],
    deliverables:['Quarter-End Close Report and Quarter-over-Quarter Operating Review','Budget true-up and annual realignment plan','Following-year proposed budget submitted at Q3 close','Following-year budget finalized and approved by October 31']},
  yearly:{label:'Annual',duration:'2.5–3 hours',minutes:[30,30,25,45,20,15],
    agenda:['Annual Year-End Close Report','Year-over-year comparison and annual Budget vs. Actual deviations','Debt, assets, liabilities, investments and insurance','Review and approval of upcoming annual budget; vision and strategy','Annual commitments, standing payables, decisions and actions','Governance calendar, archive and communication'],
    inputs:['Annual close, reconciliations, prior-year results and annual budget','Debt/card, asset, investment and insurance statements','Upcoming budget with October 31 approval evidence and annual goals'],
    deliverables:['Annual Year-End Close Report','Year-over-year and annual Budget vs. Actual review','Upcoming annual budget approval record','Annual goals, governance calendar and accountable actions']},
}
const validNumber=v=>v!==''&&v!=null&&Number.isFinite(Number(v))
const budgetCategories=new Set(['Housing','Utilities','Transportation','Insurance','Health','Debt','Food','Household','Family','Subscriptions','Discretionary','Other'])
const budgetCategory=t=>budgetCategories.has(t.category||t.cat)?t.category||t.cat:budgetCategoryForTransaction(t)
const round=v=>Math.round(v*100)/100
const labelOf=t=>t.name||t.title||t.merchant_name||'Untitled item'
const range=(from,to)=>({from:toISO(from),to:toISO(to)})

export function meetingPeriod(cadence,mode='current',now=new Date()){
  const today=getHouseholdCalendarDate(now),year=today.getFullYear(),month=today.getMonth()
  let from,to,priorFrom,priorTo
  if(cadence==='daily'){
    from=to=addDays(today,mode==='previous'?-1:0);priorFrom=priorTo=addDays(from,-1)
  }else if(cadence==='weekly'){
    from=addDays(today,-today.getDay()-(mode==='previous'?7:0));to=mode==='previous'?addDays(from,6):today
    priorFrom=addDays(from,-7);priorTo=addDays(to,-7)
  }else{
    const span=cadence==='yearly'?12:cadence==='quarterly'?3:1
    const startMonth=cadence==='yearly'?0:cadence==='quarterly'?Math.floor(month/3)*3:month
    from=new Date(year,startMonth-(mode==='previous'?span:0),1)
    to=mode==='previous'?new Date(from.getFullYear(),from.getMonth()+span,0):today
    priorFrom=new Date(from.getFullYear(),from.getMonth()-span,1)
    const priorEnd=new Date(from.getFullYear(),from.getMonth(),0)
    // Compare equal elapsed calendar days, capped at the preceding period end.
    const elapsed=Math.round((Date.UTC(to.getFullYear(),to.getMonth(),to.getDate())-Date.UTC(from.getFullYear(),from.getMonth(),from.getDate()))/86400000)
    priorTo=mode==='previous'?priorEnd:new Date(Math.min(addDays(priorFrom,elapsed).getTime(),priorEnd.getTime()))
  }
  return {...range(from,to),prior:range(priorFrom,priorTo),mode}
}

function exactAccountLinks(accounts){
  const ids=new Map(),bankIds=new Map()
  for(const a of accounts){ids.set(a.id,(ids.get(a.id)||0)+1);bankIds.set(a.plaidAccountId,(bankIds.get(a.plaidAccountId)||0)+1)}
  return new Map(accounts.filter(a=>a.id&&a.plaidAccountId&&ids.get(a.id)===1&&bankIds.get(a.plaidAccountId)===1).map(a=>[a.plaidAccountId,a.id]))
}
function totals(rows){
  return rows.reduce((v,t)=>{
    if(Number(t.amount)>=0)v.expenses+=Number(t.amount)
    else if(isRealizedIncomeTransaction({...t,pending:false}))v.income-=Number(t.amount)
    else v.otherInflows-=Number(t.amount)
    v.net=round(v.income+v.otherInflows-v.expenses)
    return v
  },{income:0,otherInflows:0,expenses:0,net:0})
}
function monthsFor(period){
  const start=parseISODate(period.from),end=parseISODate(period.to),months=[]
  for(let d=new Date(start.getFullYear(),start.getMonth(),1);d<=end;d=new Date(d.getFullYear(),d.getMonth()+1,1))months.push({year:d.getFullYear(),month:d.getMonth(),key:toISO(d).slice(0,7)})
  return months
}
function budgetReport({scheduled,budget,accounts,period,posted,legacyYear,legacyAccountId}){
  const lines=buildBudgetLines(scheduled.filter(t=>!isTransferTransaction(t)),budget,{accountIds:new Set(accounts.map(a=>a.id))}).filter(l=>l.direction==='expense')
  const owners=buildLegacyBudgetOwners(lines),months=monthsFor(period),categories=new Map()
  for(const line of lines){
    const category=budgetCategory({cat:line.category,amount:1})
    const row=categories.get(category)||{category,budget:0,missingTargets:0,planningBaseline:0,missingPlan:false}
    for(const m of months){
      const target=budgetTargetForLine({budget,line,year:m.year,month:m.month,legacyYear,legacyAccountId,legacyOwners:owners})
      if(!validNumber(target))row.missingTargets++
      else row.budget+=Number(target)
      if(!line.transactions.length)row.missingPlan=true
      for(const t of line.transactions)row.planningBaseline+=transactionOccurrencesForRange(t,range(new Date(m.year,m.month,1),new Date(m.year,m.month+1,0))).reduce((s,o)=>s+o.amount,0)
    }
    categories.set(category,row)
  }
  for(const t of posted.filter(t=>Number(t.amount)>=0)){
    const cat=budgetCategory(t)||'Other',row=categories.get(cat)||{category:cat,budget:0,missingTargets:1,planningBaseline:null,missingPlan:true}
    row.posted=(row.posted||0)+Number(t.amount);categories.set(cat,row)
  }
  return [...categories.values()].map(r=>{const {missingPlan,...report}=r;return {...report,planningBaseline:missingPlan?null:round(r.planningBaseline),budget:r.missingTargets?null:round(r.budget),posted:round(r.posted||0),remaining:r.missingTargets?null:round(r.budget-(r.posted||0))}}).sort((a,b)=>b.posted-a.posted)
}

export function buildMeetingPacket({cadence='daily',mode='current',now=new Date(),accounts=[],scheduled=[],actuals=[],budget={},budgetLegacyYear,budgetLegacyAccountId,actions=[],balanceHistory=[],balanceDataStatus='unknown',transactionFreshnessStatus='unknown',balanceCheckedAt='',transactionCheckedAt=''}={}){
  if(!MEETING_POLICIES[cadence])throw Error('Unknown financial meeting cadence.')
  const policy=MEETING_POLICIES[cadence],period=meetingPeriod(cadence,mode,now),asOf=getHouseholdDateKey(now),links=exactAccountLinks(accounts)
  const agedStatus=(status,checkedAt)=>{
    if(status!=='fresh')return status
    const age=now.getTime()-Date.parse(checkedAt)
    return !Number.isFinite(age)?'unknown':age>86400000||age< -60000?'stale':'fresh'
  }
  balanceDataStatus=agedStatus(balanceDataStatus,balanceCheckedAt)
  transactionFreshnessStatus=agedStatus(transactionFreshnessStatus,transactionCheckedAt)
  // No fallback to name matching: ambiguous bank-account links cannot qualify totals.
  const bankRows=actuals.filter(t=>links.has(t.accountId)&&validNumber(t.amount)&&parseISODate(t.date)&&t.date<=asOf&&t.type!=='transfer'&&!isTransferTransaction(t))
  const inPeriod=(t,p)=>t.date>=p.from&&t.date<=p.to
  const superseded=new Set(bankRows.filter(t=>!t.pending).map(t=>t.pendingTransactionId).filter(Boolean))
  const posted=bankRows.filter(t=>!t.pending&&inPeriod(t,period)),prior=bankRows.filter(t=>!t.pending&&inPeriod(t,period.prior)),pending=bankRows.filter(t=>t.pending&&!superseded.has(t.id))
  const linked=accounts.length>0&&links.size===accounts.length
  const currentTotals=linked&&(posted.length>0||transactionFreshnessStatus==='fresh')?totals(posted):null
  const priorTotals=linked&&prior.length>0?totals(prior):null
  const cash=accounts.filter(a=>['checking','savings'].includes(a.type))
  const cashBalance=cash.length&&cash.every(a=>validNumber(a.balance))?round(cash.reduce((v,a)=>v+Number(a.balance),0)):null
  const horizonDays=cadence==='daily'?1:cadence==='weekly'?6:cadence==='monthly'?29:89
  const horizon=range(parseISODate(asOf),addDays(parseISODate(asOf),horizonDays))
  const accountMap=Object.fromEntries(links)
  const projectedInflows=scheduled.filter(t=>t.type==='income'&&!isTransferTransaction(t)&&validNumber(t.amount)).flatMap(t=>transactionOccurrencesForRange(t,horizon).map(o=>({id:`${t.id}:${o.date}`,title:labelOf(t),date:o.date,amount:o.amount,owner:t.owner||'Larry Jenkins',status:'Projected · receipt unconfirmed'}))).sort((a,b)=>a.date.localeCompare(b.date))
  const payables=scheduled.filter(t=>t.type==='expense'&&!isTransferTransaction(t)&&validNumber(t.amount)).flatMap(t=>transactionOccurrencesForRange(t,horizon).map(o=>({id:`${t.id}:${o.date}`,title:labelOf(t),account:t.acct,date:o.date,amount:o.amount,owner:t.owner||'Larry Jenkins',status:actuals.some(a=>approvedReconciliationMatches(t,a,o.date,accountMap))?'Reconciled to posted charge':'Projected · payment unconfirmed'}))).sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title))
  const openActions=actions.filter(a=>!['done','complete','cancelled','dismissed'].includes(a.status)).map(a=>({...a,overdue:Boolean(a.due&&a.due<asOf),missingOwner:!a.owner,missingDeadline:!a.due}))
  const categoryBudget=budgetReport({scheduled,budget,accounts,period,posted,legacyYear:budgetLegacyYear,legacyAccountId:budgetLegacyAccountId})
  const warnings=[]
  if(!linked)warnings.push('Some selected accounts lack unique bank links. Household activity totals are unavailable; review account mapping.')
  if(transactionFreshnessStatus!=='fresh')warnings.push(`Bank activity is ${transactionFreshnessStatus}. Retained records may omit recent activity.`)
  if(balanceDataStatus!=='fresh')warnings.push(`Cash balances are ${balanceDataStatus}; verify balances before relying on coverage.`)
  warnings.push('Retained transaction history does not certify complete period coverage or account reconciliation. Statement review is required before close approval.')
  if(actuals.some(t=>links.has(t.accountId)&&(!validNumber(t.amount)||!parseISODate(t.date))))warnings.push('Invalid bank amount or date excluded. Resolve source errors before approving a report.')
  if(categoryBudget.some(r=>r.missingTargets))warnings.push('Budget targets are missing for some categories/months. Missing targets are not treated as zero.')
  if(cadence==='daily'||cadence==='weekly')warnings.push('Budget comparison uses full monthly targets for the months touched by this report; targets are not prorated to days or weeks.')
  if(openActions.some(a=>a.missingOwner||a.missingDeadline))warnings.push('Some open commitments need an individual owner or deadline.')
  const observations=balanceHistory.filter(h=>h.date===toISO(addDays(parseISODate(asOf),-1))).map(h=>({...h,balances:Object.fromEntries(Object.entries(h.balances||{}).filter(([id])=>cash.some(a=>a.plaidAccountId===id)))})).filter(h=>Object.keys(h.balances).length)
  const year=Number(asOf.slice(0,4))
  return {projectedInflows,schemaVersion:1,policy:'FIN-001 v2.0 · May 20, 2026',cadence,label:policy.label,duration:policy.duration,agenda:policy.agenda.map((title,i)=>({title,minutes:policy.minutes[i]})),inputs:policy.inputs,deliverables:policy.deliverables,generatedAt:now.toISOString(),asOf,period,horizon,scope:accounts.map(a=>({id:a.id,name:a.name,type:a.type})),sources:{balanceDataStatus,transactionFreshnessStatus,balanceCheckedAt,transactionCheckedAt},status:'Draft · review required',warnings,cashBalance,priorDayObservations:observations,posted:currentTotals,prior:priorTotals,pending:linked&&(pending.length||transactionFreshnessStatus==='fresh')?totals(pending):null,pendingItems:pending.map(t=>({id:t.id,title:labelOf(t),date:t.date,amount:Number(t.amount),account:links.get(t.accountId)})),categoryBudget:categoryBudget.map(r=>currentTotals?r:{...r,posted:null,remaining:null}),monthly:monthsFor(period).map(m=>({month:m.key,...(currentTotals?totals(posted.filter(t=>t.date.startsWith(m.key))):{income:null,otherInflows:null,expenses:null,net:null})})),payables,openActions,creditCards:accounts.filter(a=>a.type==='credit').map(a=>({id:a.id,name:a.name,balance:validNumber(a.balance)?Math.abs(Number(a.balance)):null,limit:validNumber(a.creditLimit)?Number(a.creditLimit):null})),budgetMilestones:[{title:`Proposed ${year+1} budget submitted`,due:`${year}-09-30`,owner:'Larry Jenkins',status:'Approval evidence required'},{title:`${year+1} budget finalized and approved`,due:`${year}-10-31`,owner:'Larry Jenkins / Terica Seay / Lorenzo Seay',status:'Approval evidence required'}]}
}

const dollars=v=>v==null?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v)
export function meetingPacketText(p){
  return [`Jenkins–Seay Household Financial Operating System`,`${p.label} meeting · ${p.duration}`,`${p.policy} · ${p.status}`,`Report period: ${p.period.from} through ${p.period.to}`,`Prior comparison: ${p.period.prior.from} through ${p.period.prior.to}`,`Prepared: ${p.generatedAt} · Household as-of date: ${p.asOf}`,`Selected accounts: ${p.scope.map(a=>a.name).join(', ')||'None'}`,`Sources: balance ${p.sources.balanceDataStatus} (${p.sources.balanceCheckedAt||'check time unavailable'}); activity ${p.sources.transactionFreshnessStatus} (${p.sources.transactionCheckedAt||'check time unavailable'})`,
    '\nAGENDA',...p.agenda.map(a=>`${a.minutes}m: ${a.title}`),'\nREQUIRED INPUTS',...p.inputs,
    '\nEXECUTIVE INSIGHTS / RISKS',...p.warnings,'\nCASH POSITION',`Current stored cash balance: ${dollars(p.cashBalance)}`,`Prior-day observations: ${p.priorDayObservations.length}. Intraday observations are not certified opening/closing balances.`,
    '\nPOSTED ACTIVITY',`Recognized income: ${dollars(p.posted?.income)}`,`Other inflows: ${dollars(p.posted?.otherInflows)}`,`Expenses: ${dollars(p.posted?.expenses)}`,`Net: ${dollars(p.posted?.net)}`,`Prior-period net: ${dollars(p.prior?.net)}`,
    '\nPENDING TRANSACTIONS',`Pending inflows: ${p.pending?dollars(p.pending.income+p.pending.otherInflows):'Unavailable'}; pending expenses: ${dollars(p.pending?.expenses)}`,...p.pendingItems.map(t=>`${t.date} · ${t.title} · bank-signed ${dollars(t.amount)}`),
    '\nSPENDING TRENDS / BUDGET VARIANCE', 'Monthly targets for months touched; posted expense comparison only. Pending/projected not added.',...p.categoryBudget.map(r=>`${r.category}: target ${dollars(r.budget)}; posted ${dollars(r.posted)}; remaining ${dollars(r.remaining)}`),
    '\nMONTH-BY-MONTH RESULTS',...p.monthly.map(m=>`${m.month}: income ${dollars(m.income)}; other inflows ${dollars(m.otherInflows)}; expense ${dollars(m.expenses)}; net ${dollars(m.net)}`),
    '\nSTANDING PAYABLES / FORECASTED POSITION',`Horizon: ${p.horizon.from} through ${p.horizon.to}. Scheduled items are projections, not proof of payment. Pending and projected are not combined; unresolved overlap requires reconciliation.`,...p.payables.map(r=>`${r.date} · ${r.title} · ${dollars(r.amount)} · ${r.owner} · ${r.status}`),
    '\nPROJECTED INFLOWS',...p.projectedInflows.map(r=>`${r.date} · ${r.title} · ${dollars(r.amount)} · ${r.owner} · ${r.status}`),
    '\nCREDIT CARD SUMMARY',...p.creditCards.map(r=>`${r.name}: balance ${dollars(r.balance)}; limit ${dollars(r.limit)}; payoff target/progress requires review`),
    '\nDECISIONS / OPEN ACTIONS',...p.openActions.map(a=>`${a.text} · ${a.owner||'Owner required'} · due ${a.due||'Deadline required'} · ${a.overdue?'OVERDUE':a.status||'open'}`),
    '\nBUDGET MILESTONES',...p.budgetMilestones.map(m=>`${m.title} · ${m.due} · ${m.owner} · ${m.status}`),
    '\nDELIVERABLES',...p.deliverables,'\nHUMAN REVIEW REQUIRED','Explain deviations, behavior changes, account balances and strategic findings. Confirm reconciliation, communication, approval evidence and delivery. Archiving a packet does not certify a close or approve a budget.',
    ...(p.analysis?['\nAUTOMATIC ANALYSIS',p.analysis.mode,p.analysis.summary,p.analysis.direction,p.analysis.insights,p.analysis.actions,'\nREPORT NOTES',p.notes||'','\nHOUSEHOLD ADJUSTMENTS',...(p.adjustments||[]).map(a=>`${a.field}: source ${String(a.sourceValue??'unknown')}; reported ${String(a.value??'unknown')}; ${a.by}; ${a.at}; ${a.reason}`)]:[])].join('\n')
}
