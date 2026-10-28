// The screen and export share these figures. Unknown evidence is never zero-filled.
export const MEETING_DESIGNS={
 daily:{heading:'Protect today’s cash.',subtitle:'What needs our attention before tomorrow?',agenda:[['Cash & payments',3],['Exceptions & decisions',4],['Owners & recap',3]]},
 weekly:{heading:'Stay ahead of next week.',subtitle:'Review spending, cover what’s due, adjust together.',agenda:[['Results & spending',10],['Next week’s cash',10],['Adjustments & owners',10]]},
 monthly:{heading:'Close the month. Set the next.',subtitle:'Understand the result and agree the next month’s priorities.',agenda:[['Close & reconciliation',20],['Budget & comparisons',20],['Next month & decisions',20]]},
 quarterly:{heading:'Check direction. Adjust the plan.',subtitle:'Connect three months of results to the annual goals.',agenda:[['Quarter close & trends',30],['Annual outlook & risks',30],['Priorities & budget',30]]},
 yearly:{heading:'Review the year. Agree the future.',subtitle:'Close the year, review household finances, approve the next plan.',agenda:[['Annual close & comparisons',60],['Assets, debt & protection',60],['Budget, goals & calendar',60]]},
}
export const briefMoney=v=>v==null||v===''||!Number.isFinite(Number(v))?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v))
export function meetingBrief(p){
 const design=MEETING_DESIGNS[p.cadence],cashNote=`${p.sources.balanceDataStatus} bank snapshot`,postedNote=`${p.sources.transactionFreshnessStatus} activity · selected report period`
 const due=p.payables.filter(x=>x.status!=='Reconciled to posted charge'),sum=xs=>Math.round(xs.reduce((n,x)=>n+Number(x.amount),0)*100)/100
 const cashScope=p.scope.some(a=>['checking','savings'].includes(a.type))
 const obligations=cashScope?sum(due):null,inflows=cashScope?sum(p.projectedInflows):null
 // This is a scheduled scenario, not a safe-to-spend balance. Pending holds may overlap.
 const forecast=p.cashBalance==null||obligations==null?null:p.cashBalance+inflows-obligations
 const metrics=p.cadence==='daily'?[
  ['Cash balance',p.cashBalance,cashNote],['Due today / tomorrow',obligations,'Scheduled · not yet reconciled'],['Scheduled cash scenario',forecast,'Forecast · verify pending overlap'],['Open commitments',p.openActions.length,`${p.openActions.filter(a=>a.missingDeadline).length} need a deadline`,'count'],
 ]:p.cadence==='weekly'||p.cadence==='monthly'?[
  ['Posted income',p.posted?.income,postedNote],['Posted spending',p.posted?.expenses,postedNote],[`${p.label} net cash flow`,p.posted?.net,'Includes other posted inflows; transfers excluded'],['Open commitments',p.openActions.length,`${p.openActions.filter(a=>a.overdue).length} overdue`,'count'],
 ]:[
  [`${p.label} net cash flow`,p.posted?.net,postedNote],['Prior-period net',p.prior?.net,'Comparable preceding period'],['Cash balance',p.cashBalance,cashNote],['Open commitments',p.openActions.length,`${p.openActions.filter(a=>a.overdue).length} overdue`,'count'],
 ]
 const table=p.cadence==='daily'?{title:'Next 48 hours',headers:['Commitment','Due','Amount'],rows:due.slice(0,3).map(x=>[x.title,x.date,briefMoney(x.amount)]),detail:'Standing payables and forecasted obligations'}:p.cadence==='weekly'?{title:'Spending that needs discussion',headers:['Category','Posted','Monthly target'],rows:p.categoryBudget.slice(0,3).map(x=>[x.category,briefMoney(x.posted),briefMoney(x.budget)]),detail:'Spending trends, budget variance and comparisons'}:p.cadence==='monthly'?{title:'Results for the month',headers:['Measure','This period','Prior period'],rows:[['Income',briefMoney(p.posted?.income),briefMoney(p.prior?.income)],['Spending',briefMoney(p.posted?.expenses),briefMoney(p.prior?.expenses)],['Net cash flow',briefMoney(p.posted?.net),briefMoney(p.prior?.net)]],detail:'Spending trends, budget variance and comparisons'}:{title:p.cadence==='quarterly'?'Three-month net cash flow':'Year in review',headers:['Month','Income','Net cash flow'],rows:p.monthly.map(x=>[x.month,briefMoney(x.income),briefMoney(x.net)]),detail:'Spending trends, budget variance and comparisons'}
 if(p.cadence==='yearly'){
  const quarters=new Map();for(const m of p.monthly){const key=`${m.month.slice(0,4)} Q${Math.ceil(Number(m.month.slice(5))/3)}`;const q=quarters.get(key)||{income:0,net:0,valid:true};q.valid=q.valid&&m.income!=null&&m.net!=null;q.income+=m.income||0;q.net+=m.net||0;quarters.set(key,q)}
  table.headers=['Quarter','Income','Net cash flow'];table.rows=[...quarters].map(([k,v])=>[k,briefMoney(v.valid?v.income:null),briefMoney(v.valid?v.net:null)])
 }
 const decisions=p.analysis?.recommendations?.slice(0,2)||[]
 return {...design,metrics,table,decisions,obligations,inflows,forecast,focus:p.cadence==='weekly'?'Posted spending is compared with full monthly targets. Weekly targets have not been inferred.':p.cadence==='daily'?'Confirm payment timing and pending holds before relying on the scheduled scenario.':'Review differences, agree priorities, and leave with owners and deadlines.'}
}
export function meetingBriefReport(p){
 const b=meetingBrief(p),section=(title,labels,rows)=>({title,columns:labels.map(label=>({label})),rows})
 return {title:`${p.label} meeting ${p.period.from} to ${p.period.to}`,meetingPacket:p,notes:[`Selected accounts: ${p.scope.map(a=>a.name).join(', ')||'None'}`,`Balance: ${p.sources.balanceDataStatus}; activity: ${p.sources.transactionFreshnessStatus}. Draft report.`,...(p.adjustments?.length?[`${p.adjustments.length} household adjustments; original values retained in source notes.`]:[])],sections:[
 section('Meeting brief',['Measure','Value','Context'],b.metrics.map(([l,v,n])=>[l,v??'Unavailable',n])),
 section('Agenda',['Discussion','Minutes'],b.agenda),
 section('Commitments',['Action','Owner','Due','Status'],p.openActions.map(a=>[a.text,a.owner||'Owner needed',a.due||'Date needed',a.overdue?'Overdue':a.status||'Open'])),
 section('Spending',['Category','Posted expense','Monthly targets','Remaining target'],p.categoryBudget.map(x=>[x.category,x.posted??'Unavailable',x.budget??'Unavailable',x.remaining??'Unavailable'])),
 section('Scheduled obligations',['Item','Date','Amount','Status'],p.payables.map(x=>[x.title,x.date,x.amount,x.status])),
 section('Source notes',['Note'],[...p.warnings,...(p.adjustments||[]).map(a=>`${a.field}: original ${a.sourceValue??'unknown'}; reported ${a.value??'unknown'}. ${a.reason||''}`)].map(x=>[x])),
 ]}
}
