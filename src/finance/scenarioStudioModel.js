import {TAX_PROFILE,calculateIncomeRows,round} from './scenarioTax.js'
import {projectMonthlyStudio,DEFAULT_STUDIO_RESERVE,taxKind} from './scenarioPayoffPlan.js'
import {validDate} from './recoveryScenario.js'
const DAY=86400000
const stamp=d=>Date.parse(d+'T12:00:00Z')
const iso=t=>new Date(t).toISOString().slice(0,10)
export const frequencyFactors={monthly:12,semimonthly:24,biweekly:26,weekly:52,annual:1,once:0}
const sum=(rows,key)=>round(rows.reduce((s,r)=>s+(r[key]||0),0))
export function newIncome(start) {return {id:crypto.randomUUID(),name:'New income',person:'LJ',mode:'gross',annualGross:0,monthlyNet:0,pretax:0,posttax:0,extraWithholding:0,frequency:'monthly',start,startDateSource:'explicit',end:'',enabled:true}}
export function newExpense(start){return {id:crypto.randomUUID(),name:'New expense',amount:0,frequency:'monthly',start,end:'',enabled:true}}
export function createStudio(scenario,expense,debts,start,floor=DEFAULT_STUDIO_RESERVE) {
 let liabilities=debts.filter(d=>d.status==='Active'&&d.currentBalance>0).map(d=>({id:d.id,name:d.creditor||d.accountName||'Liability',balance:d.currentBalance,apr:d.interestRate,payment:d.minimumPayment,dueDay:d.dueDay||1,include:true,method:d.interestMethod||'Amortized APR'}))
 const notes=scenario.source?.notes||[]
 const importedDebts=notes.flatMap(note=>{const m=note.match(/^(.*):\s*\$([\d,.]+); monthly cashflow released after payoff:\s*\$([\d,.]+)/i);return m?[{id:`imported-${crypto.randomUUID()}`,name:m[1],balance:Number(m[2].replaceAll(',','')),payment:Number(m[3].replaceAll(',','')),apr:0,dueDay:1,include:true,method:'Principal only'}]:[]})
 if(importedDebts.length)liabilities=importedDebts
 const annualTaxes=notes.flatMap(note=>{const m=note.match(/^Annual (.*tax.*):\s*\$([\d,.]+)/i);if(!m)return [];const month=/property/i.test(m[1])?'10':'04';const year=Number(start.slice(0,4))+(start.slice(5)>`${month}-01`?1:0);return [{...newExpense(`${year}-${month}-01`),name:`Annual ${m[1]}`,amount:Number(m[2].replaceAll(',','')),frequency:'annual'}]})
 const payments=sum(liabilities,'payment')
 const incomes=(scenario.incomes||[]).map((r,i)=>({...newIncome(r.start||start.slice(0,7)+'-01'),end:r.end||'',startDateSource:r.start?'explicit':'month-default',id:r.id||`income-${i}`,name:r.description||'Income',person:(r.description||'').match(/^(LJ|LS|NS|JS|TS)\b/)?.[1]||`Person ${i+1}`,mode:'net',annualGross:Number(r.annualGross)||0,monthlyNet:Number(r.monthlyNet)||0}))
 return {version:1,incomeDateVersion:1,planningVersion:2,projectionMode:'monthly',title:scenario.title||'Current State',favorite:false,start,months:36,openingCash:null,cashFloor:floor,protectedReserve:0,strategy:'priority',timingConfirmed:false,
  source:'Snapshot of existing scenario; recurring total includes required debt payments. Confirm bill/pay dates and debt allocation.'+(importedDebts.length?' Imported workbook liabilities are principal-only until you supply APRs. Annual tax assumptions are included.':''),
  incomes,expenses:[{...newExpense(start),id:'baseline-expense',name:'Existing recurring living expenses',amount:Math.max(0,expense-payments)},...annualTaxes],liabilities,profiles:Object.fromEntries(incomes.map(r=>[r.person,{...TAX_PROFILE}]))}
}
export function validateStudio(raw) {
 if(!raw||raw.version!==1)throw Error('Unsupported Scenario Studio version.')
 const a=JSON.parse(JSON.stringify(raw))
 const num=(n,label,min=0,max=1e9)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error(`${label} must be between ${min} and ${max}.`)}
 const text=(s,label)=>{if(typeof s!=='string'||!s.trim()||s.length>250)throw Error(`${label} is required (250 characters maximum).`)}
 if(a.projectionMode!==undefined&&!['monthly','dated'].includes(a.projectionMode))throw Error('Choose a valid projection mode.');
 text(a.title,'Scenario name');if(!validDate(a.start))throw Error('Choose a valid planning start.')
 num(a.months,'Horizon',1,60);if(!Number.isInteger(a.months))throw Error('Horizon must be whole months.')
 for(const k of ['cashFloor','protectedReserve'])num(a[k],k)
 if(a.openingCash!==null)num(a.openingCash,'Opening cash',-1e9)
 if(!['priority','highest-apr','lowest-balance'].includes(a.strategy))throw Error('Choose a payoff strategy.')
 if(typeof a.favorite!=='boolean'||typeof a.timingConfirmed!=='boolean')throw Error('Invalid scenario settings.')
 for(const kind of ['incomes','expenses','liabilities']) {
  if(!Array.isArray(a[kind])||a[kind].length>100)throw Error('Use at most 100 rows per section.')
  const ids=new Set()
  for(const r of a[kind]){
   if(r.taxKind!==undefined&&!['','property-tax','income-tax'].includes(r.taxKind))throw Error('Choose a valid tax category.');
   if(r.dueDate&&!validDate(r.dueDate))throw Error('Choose a valid tax due date.');
   text(r.id,'Row ID');if(ids.has(r.id))throw Error('Duplicate row ID.');ids.add(r.id);text(r.name,'Row name')
   if(kind==='liabilities'){
    for(const k of ['balance','apr','payment','dueDay'])num(r[k],k,0,k==='apr'?100:k==='dueDay'?31:1e9)
    if(!Number.isInteger(r.dueDay)||r.dueDay<1)throw Error('Debt due day must be 1–31.')
    if(r.method!=='Amortized APR'&&r.method!=='Principal only')throw Error('Use monthly APR or principal-only liabilities; fixed-interest debts need a supported schedule.')
    if(typeof r.include!=='boolean')throw Error('Invalid payoff selection.')
   }else{
    if(!Object.hasOwn(frequencyFactors,r.frequency))throw Error('Choose a valid frequency.')
    if(!validDate(r.start)||(r.end&&(!validDate(r.end)||r.end<r.start)))throw Error('Choose valid start and end dates.')
    if(typeof r.enabled!=='boolean')throw Error('Invalid row setting.')
    if(kind==='expenses')num(r.amount,'Expense amount')
    else {text(r.person,'Person');if(!['gross','net'].includes(r.mode))throw Error('Choose gross or net income.');if(['annual','once'].includes(r.frequency))throw Error('Income uses monthly, semimonthly, biweekly or weekly pay.');for(const k of ['annualGross','monthlyNet','pretax','posttax','extraWithholding'])num(r[k],k);if(r.pretax>r.annualGross)throw Error('Pre-tax deductions cannot exceed gross income.')}
   }
  }
 }
 if(!a.profiles||typeof a.profiles!=='object'||Array.isArray(a.profiles))throw Error('Tax profiles are required.')
 for(const p of Object.values(a.profiles)) {if(p.year!==2026||p.state!=='GA'||!['single','joint','separate','head'].includes(p.filing))throw Error('Use 2026 Georgia tax criteria or known net pay.');for(const k of ['dependents','credits','otherGross','otherPretax'])num(p[k],k);if(!Number.isInteger(p.dependents)||p.dependents>30)throw Error('Invalid dependent count.')}
 return a
}
function occurs(r,date){
 if(!r.enabled||date<r.start||(r.end&&date>r.end))return false
 if(r.frequency==='once')return date===r.start
 if(r.frequency==='weekly'||r.frequency==='biweekly')return Math.round((stamp(date)-stamp(r.start))/DAY)%(r.frequency==='weekly'?7:14)===0
 const d=new Date(stamp(date)),last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(),due=Math.min(Number(r.start.slice(8)),last)
 if(r.frequency==='semimonthly')return d.getUTCDate()===1||d.getUTCDate()===16
 return d.getUTCDate()===due&&(r.frequency!=='annual'||date.slice(5,7)===r.start.slice(5,7))
}
export function studioMonthly(raw,date=raw.start) {
 const a=validateStudio(raw), active=r=>r.enabled&&r.start<=date&&(!r.end||r.end>=date)
 const incomes=calculateIncomeRows(a.incomes.filter(active),a.profiles)
 const income=sum(incomes,'monthlyNet'),gross=sum(incomes,'annualGross')/12
 const living=round(a.expenses.filter(r=>active(r)&&!(a.projectionMode==='monthly'&&taxKind(r)&&['annual','once'].includes(r.frequency))).reduce((s,r)=>s+r.amount*frequencyFactors[r.frequency]/12,0))
 const required=a.projectionMode==='monthly'?0:sum(a.liabilities.filter(d=>d.balance>0),'payment')
 return {income,gross:round(gross),deductions:incomes.every(r=>r.annualGross>0)?round(gross-income):null,living,required,cashFlow:round(income-living-required),incomes}
}
export function projectStudio(raw){
 const a=validateStudio(raw);if(a.projectionMode==='monthly')return projectMonthlyStudio(a);const start=stamp(a.start),endDate=new Date(start);endDate.setUTCMonth(endDate.getUTCMonth()+a.months,1);const end=endDate.getTime()-DAY
 const dates=[];for(let t=start;t<=end;t+=DAY)dates.push(iso(t))
 const debts=a.liabilities.map(d=>({...d,remaining:d.balance,interest:0,paidDate:null}))
 const inputs=dates.map(date=>{
  const active=a.incomes.filter(r=>r.enabled&&r.start<=date&&(!r.end||r.end>=date))
  const incomes=calculateIncomeRows(active,a.profiles)
  const paid=incomes.filter(r=>occurs(r,date)),gross=round(paid.reduce((s,r)=>s+r.annualGross/frequencyFactors[r.frequency],0)),income=round(paid.reduce((s,r)=>s+r.monthlyNet*12/frequencyFactors[r.frequency],0));
  return {date,income,gross,deductions:paid.some(r=>r.annualGross===0&&r.monthlyNet>0)?null:round(gross-income),expenses:round(a.expenses.filter(r=>occurs(r,date)).reduce((s,r)=>s+r.amount,0))}
 })
 // Conservative future funding envelope: retain every scheduled debt minimum,
 // even after a projected payoff, when deciding how much extra cash is safe.
 const minimums=dates.map(date=>{const d=new Date(stamp(date)),last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();return sum(debts.filter(x=>x.remaining>0&&d.getUTCDate()===Math.min(x.dueDay,last)),'payment')})
 const futureNeed=Array(dates.length+1).fill(0)
 for(let i=dates.length-1;i>=0;i--)futureNeed[i]=Math.max(0,futureNeed[i+1]-inputs[i].income+inputs[i].expenses+minimums[i])
 let cash=a.openingCash,lowest=cash===null?null:cash-a.protectedReserve,firstShortfall=cash!==null&&cash-a.protectedReserve<a.cashFloor?{date:a.start,amount:round(a.cashFloor-(cash-a.protectedReserve))}:null
 const daily=[],months=[],payoffs=[]
 for(let i=0;i<dates.length;i++){
  const r=inputs[i],d=new Date(stamp(r.date)),last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();let required=0,extra=0,interest=0
  for(const debt of debts){
   if(debt.remaining<=0)continue
   const accrued=debt.method==='Principal only'?0:debt.remaining*debt.apr/100/365;debt.interest+=accrued;interest+=accrued
   if(d.getUTCDate()===Math.min(debt.dueDay,last)){
    const payment=round(Math.min(debt.remaining+debt.interest,debt.payment));required+=payment
    const toInterest=Math.min(payment,debt.interest);debt.interest-=toInterest;debt.remaining=round(Math.max(0,debt.remaining-(payment-toInterest)))
    if(debt.remaining===0&&debt.interest<.005){debt.interest=0;debt.paidDate=r.date;payoffs.push({date:r.date,name:debt.name,amount:payment,releasedMonthly:debt.payment})}
   }
  }
  if(cash!==null){
   cash=round(cash+r.income-r.expenses-required)
   let capacity=a.timingConfirmed?Math.max(0,cash-a.protectedReserve-a.cashFloor-futureNeed[i+1]):0
   const order=debts.filter(x=>x.include&&x.remaining+x.interest>0).sort((x,y)=>a.strategy==='highest-apr'?y.apr-x.apr:a.strategy==='lowest-balance'?x.remaining-y.remaining:0)
   for(const debt of order){
    // Full settlement avoids claiming an unspecified lender treatment of partial prepayments.
    const settlement=round(debt.remaining+debt.interest)
    if(settlement>capacity)continue
    cash=round(cash-settlement);capacity=round(capacity-settlement);extra+=settlement;debt.remaining=0;debt.interest=0;debt.paidDate=r.date
    payoffs.push({date:r.date,name:debt.name,amount:settlement,releasedMonthly:debt.payment})
   }
   const available=round(cash-a.protectedReserve);lowest=Math.min(lowest,available)
   if(available<a.cashFloor&&!firstShortfall)firstShortfall={date:r.date,amount:round(a.cashFloor-available)}
  }
  const row={...r,required:round(required),extra:round(extra),interest:round(interest),cash,available:cash===null?null:round(cash-a.protectedReserve)};daily.push(row)
  let m=months.at(-1);if(!m||m.month!==r.date.slice(0,7)){m={month:r.date.slice(0,7),income:0,gross:0,deductions:0,expenses:0,required:0,extra:0,cashFlow:0,endingCash:null,available:null};months.push(m)}
  for(const k of ['income','gross','expenses','required','extra'])m[k]=round(m[k]+row[k]);m.deductions=m.deductions===null||row.deductions===null?null:round(m.deductions+row.deductions);m.cashFlow=round(m.income-m.expenses-m.required);m.endingCash=cash;m.available=row.available
 }
 return {daily,months,payoffs,lowest,firstShortfall,endingCash:cash,unpaid:round(debts.reduce((s,d)=>s+d.remaining+d.interest,0)),debtFree:debts.length&&debts.every(d=>d.remaining+d.interest<.005)?payoffs.at(-1)?.date:null,warnings:[...(a.openingCash===null?['Enter opening cash to calculate balances and extra payoffs.']:[]),...(!a.timingConfirmed?['Confirm all payment dates and the debt allocation to enable extra payoffs.']:[]),'2026 tax rules are held constant across the horizon. W-2 estimates use annualized earnings; partial-year withholding and refunds are not payroll predictions.','Daily APR accrual is estimated. Full settlements follow priority among affordable debts; lender fees are not included.']}
}
