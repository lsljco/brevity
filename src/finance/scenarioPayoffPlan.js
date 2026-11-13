import {calculateIncomeRows,round} from './scenarioTax.js'
const DAY=86400000
const stamp=date=>Date.parse(date+'T12:00:00Z')
const iso=date=>date.toISOString().slice(0,10)
const monthName=date=>new Date(stamp(date)).toLocaleDateString('en-US',{month:'long',timeZone:'UTC'})
const factors={monthly:12,semimonthly:24,biweekly:26,weekly:52}
export const taxKind=row=>row.taxKind??(/property.*tax/i.test(row.name)?'property-tax':/income.*tax/i.test(row.name)?'income-tax':'')
export const DEFAULT_STUDIO_RESERVE=24000
export function upgradeStudioPlan(raw){
 const a=JSON.parse(JSON.stringify(raw))
 // Older scenario snapshots copied the planning date into every imported net-income row.
 // Repair that inherited default once; keep explicitly marked or distinct source dates.
 if(a.incomeDateVersion!==1){
  if(a.source?.startsWith('Snapshot of existing scenario;'))for(const row of a.incomes||[]){
   if(row.mode==='net'&&!row.startDateSource&&row.start===a.start){row.start=a.start.slice(0,7)+'-01';row.startDateSource='month-default'}
  }
  a.incomeDateVersion=1
 }
 if(a.planningVersion!==2){a.cashFloor=Math.max(DEFAULT_STUDIO_RESERVE,a.cashFloor||0);a.projectionMode='monthly';a.planningVersion=2}
 return a
}
export function savedScenarioCash(accounts=[]){
 const cash=accounts.filter(a=>['checking','savings'].includes(a.type))
 if(!cash.length||cash.some(a=>!a.plaidAccountId||!Number.isFinite(a.plaidCurrentBalance))||new Set(cash.map(a=>a.plaidAccountId)).size!==cash.length)return null
 return round(cash.reduce((s,a)=>s+a.plaidCurrentBalance,0))
}
export const payoffPriority=debt=>taxKind(debt)==='property-tax'?0:taxKind(debt)==='income-tax'?1:2
const outstanding=debt=>round(Math.max(0,debt.remaining+debt.interest))
const total=debts=>round(debts.reduce((s,d)=>s+outstanding(d),0))
function accrue(debt,days){
 if(debt.remaining&&!taxKind(debt)&&debt.method!=='Principal only')debt.interest+=debt.remaining*debt.apr/100*days/365
}
export function periodInputs(a,count){
 const first=new Date(stamp(a.start)),cache=new Map(),rows=[]
 for(let index=0;index<count;index++){
  const begin=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+index,1,12)),end=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+index+1,0,12))
  const start=index===0?a.start:iso(begin),last=iso(end),days=end.getUTCDate(),r={date:last,month:last.slice(0,7),days:Math.round((stamp(last)-stamp(start))/DAY)+1,income:0,gross:0,deductions:0,expenses:0,recurring:0,oneTime:0,bonus:0,bonusItems:[],oneTimeItems:[],taxBills:[]}
  r.bonusItems=(a.bonuses||[]).filter(b=>b.enabled&&b.date>=start&&b.date<=last)
  r.bonus=round(r.bonusItems.reduce((sum,b)=>sum+b.amount,0))
  r.recurring=round(a.expenses.filter(x=>x.enabled&&factors[x.frequency]&&x.start<=last&&(!x.end||x.end>=iso(begin))).reduce((sum,x)=>sum+x.amount*factors[x.frequency]/12,0))
  for(let t=stamp(iso(begin));t<=stamp(last);t+=DAY){
   const date=iso(new Date(t)),active=a.incomes.filter(x=>x.enabled&&x.start<=date&&(!x.end||x.end>=date)),key=JSON.stringify(active.map(x=>x.id))
   if(!cache.has(key))cache.set(key,calculateIncomeRows(active,a.profiles))
   const incomes=cache.get(key)
   const net=incomes.reduce((s,x)=>s+x.monthlyNet,0),gross=incomes.reduce((s,x)=>s+x.annualGross/12,0)
   r.income+=net/days;r.gross+=gross/days
   if(incomes.some(x=>!x.annualGross&&x.monthlyNet>0))r.deductions=null
   else if(r.deductions!==null)r.deductions+=(gross-net)/days
   if(date<start)continue
   for(const x of a.expenses.filter(x=>x.enabled&&x.start<=date&&(!x.end||x.end>=date))){
    if(!factors[x.frequency]&&((x.frequency==='once'&&x.start===date)||(x.frequency==='annual'&&date.slice(5,7)===x.start.slice(5,7)&&Number(date.slice(8))===Math.min(Number(x.start.slice(8)),days)))){
     const kind=taxKind(x)
     if(kind){const year=Number(date.slice(0,4))-(kind==='income-tax'?1:0);r.taxBills.push({id:`${x.id}:${date}`,name:x.frequency==='once'?`${x.name}${/payoff$/i.test(x.name)?'':' payoff'}`:`${year} ${kind==='property-tax'?'property':'income'} tax payoff`,amount:x.amount,dueDate:date,taxKind:kind})}
     else {r.oneTime+=x.amount;r.oneTimeItems.push({...x,date})}
    }
   }
  }
  r.oneTime=round(r.oneTime);r.expenses=round(r.recurring+r.oneTime)
  for(const key of ['income','gross','expenses'])r[key]=round(r[key]);if(r.deductions!==null)r.deductions=round(r.deductions)
  rows.push(r)
 }
 return rows
}
// Protect living expenses and higher-priority taxes; monthly debt minimums are not modeled.
function fundingNeed(inputs,index,current,excludedId,priority=2){
 const debts=current.filter(d=>d.id!==excludedId&&outstanding(d)>0&&taxKind(d)&&payoffPriority(d)<priority).map(d=>({...d}))
 let running=-debts.filter(d=>taxKind(d)&&(!d.dueDate||d.dueDate<=inputs[index].date)).reduce((s,d)=>{const amount=outstanding(d);d.remaining=0;d.interest=0;return s+amount},0),need=Math.max(0,-running)
 for(let i=index+1;i<inputs.length;i++){
  const r=inputs[i];let required=0
  for(const d of debts){
   if(taxKind(d)){if(outstanding(d)&&d.dueDate<=r.date){required+=outstanding(d);d.remaining=0;d.interest=0}}
  }
  running=round(running+r.income+r.bonus-r.expenses-required-r.taxBills.filter(t=>payoffPriority(t)<priority).reduce((s,t)=>s+t.amount,0));need=Math.max(need,-running)
 }
 return round(need)
}
export function projectMonthlyStudio(a){
 const inputs=periodInputs(a,a.months+12),debts=a.liabilities.map(d=>({...d,remaining:d.balance,interest:0,original:true,taxKind:taxKind(d)}))
 const nonTaxIds=new Set(debts.filter(d=>d.balance>0&&!taxKind(d)).map(d=>d.id))
 const originalIds=new Set(debts.filter(d=>d.balance>0).map(d=>d.id)),payoffs=[],months=[],ledger=[],taxDeadlines=[]
 let cash=a.openingCash,lowest=cash===null?null:cash-a.protectedReserve,firstShortfall=cash!==null&&lowest<a.cashFloor?{date:a.start,amount:round(a.cashFloor-lowest)}:null,debtFree=null,nonTaxDebtFree=null
 const append=(date,description,amount,unpaid,note='',type='movement',item=null)=>ledger.push({item,type,year:Number(date.slice(0,4)),month:monthName(date),date,description,amount,cashBalance:cash,protectedReserve:round(a.cashFloor+a.protectedReserve),unpaidLiabilities:unpaid,note})
 append(a.start,'Opening savings / cash',0,total(debts),a.openingCash===null?'Opening cash is required.':'Starting balance, not new income.')
 for(let index=0;index<a.months;index++){
  const r=inputs[index];const required=0;let extra=0,taxes=0
  for(const d of debts)accrue(d,r.days)
  for(const bill of r.taxBills){if(bill.amount>0)debts.push({...bill,balance:bill.amount,remaining:bill.amount,interest:0,payment:0,apr:0,include:true,method:'Principal only',original:false});taxDeadlines.push({...bill,paidDate:bill.amount===0?r.date:null})}
  const cashFlow=round(r.income-r.recurring)
  if(cash!==null)cash=round(cash+cashFlow)
  append(r.date,`${monthName(r.date)} cash flow`,cashFlow,total(debts),`Net income $${r.income.toFixed(2)}; monthly recurring expenses $${r.recurring.toFixed(2)}; monthly debt minimums are not deducted.`)
  for(const b of r.bonusItems){if(cash!==null)cash=round(cash+b.amount);append(b.date,b.name,b.amount,total(debts),'One-time net payout; separate from recurring monthly income.','movement',{kind:'bonuses',id:b.id})}
  for(const x of r.oneTimeItems){if(cash!==null)cash=round(cash-x.amount);append(x.date,x.name,-x.amount,total(debts),'One-time expense; separate from monthly cash flow.','movement',{kind:'expenses',id:x.id})}
  const order=debts.filter(d=>d.include&&outstanding(d)>0&&(!taxKind(d)||d.original||!d.dueDate||d.dueDate<=r.date)).sort((x,y)=>{
   if(payoffPriority(x)!==payoffPriority(y))return payoffPriority(x)-payoffPriority(y)
   if(taxKind(x))return (x.dueDate||a.start).localeCompare(y.dueDate||a.start)
   return a.strategy==='highest-apr'?y.apr-x.apr:a.strategy==='lowest-balance'?outstanding(x)-outstanding(y):0
  })
  let deferred=0
  for(const d of order){
   const settlement=outstanding(d)
   if(d.plannedPayoffDate&&d.plannedPayoffDate.slice(0,7)>r.month)continue
   if(debts.some(other=>outstanding(other)>0&&payoffPriority(other)<payoffPriority(d))){deferred++;continue}
   if(cash===null)continue
   if(cash-settlement<a.cashFloor+a.protectedReserve){deferred++;continue}
   const need=fundingNeed(inputs,index,debts,d.id,payoffPriority(d))
   if(round(cash-settlement-a.cashFloor-a.protectedReserve)<need){deferred++;continue}
   cash=round(cash-settlement);d.remaining=0;d.interest=0
   const isTax=Boolean(taxKind(d));if(isTax)taxes=round(taxes+settlement);else extra=round(extra+settlement)
   const payoffDate=d.plannedPayoffDate?.slice(0,7)===r.month?d.plannedPayoffDate:r.date
   const p={date:payoffDate,name:d.name,amount:settlement,releasedMonthly:0,source:isTax?'tax':'extra',id:d.id};payoffs.push(p)
   const bill=taxDeadlines.find(t=>t.id===d.id);if(bill)bill.paidDate=r.date
   append(payoffDate,/payoff$/i.test(d.name)?d.name:`${d.name} payoff`,-settlement,total(debts),isTax?'Tax balance paid; payroll withholding is not charged again.':'Full liability payoff; no monthly minimums were deducted.','payoff',d.original?{kind:'liabilities',id:d.id}:null)
  }
  if(!nonTaxDebtFree&&nonTaxIds.size&&debts.filter(d=>nonTaxIds.has(d.id)).every(d=>outstanding(d)===0)){nonTaxDebtFree=r.date;append(r.date,'All non-tax liabilities paid off',0,total(debts),'Property taxes and income taxes are excluded from this milestone and continue in the forecast.','milestone')}
  if(!debtFree&&originalIds.size&&debts.filter(d=>originalIds.has(d.id)).every(d=>outstanding(d)===0))debtFree=r.date
  const available=cash===null?null:round(cash-a.protectedReserve)
  if(cash!==null){lowest=Math.min(lowest,available);if(available<a.cashFloor&&!firstShortfall)firstShortfall={date:r.date,amount:round(a.cashFloor-available)}}
  const overdue=debts.filter(d=>taxKind(d)&&outstanding(d)>0&&(!d.dueDate||d.dueDate<=r.date))
  const propertyRemaining=total(debts.filter(d=>taxKind(d)==='property-tax'&&outstanding(d)>0))
  const missed=debts.filter(d=>d.include&&outstanding(d)>0&&d.plannedPayoffDate&&d.plannedPayoffDate.slice(0,7)<=r.month)
  const reason=cash===null?'Enter opening cash to calculate payoff dates.':available<a.cashFloor?`Rebuilding reserve: ${round(a.cashFloor-available).toFixed(2)} below target.`:propertyRemaining?`Surplus held for property taxes: ${propertyRemaining.toFixed(2)} remains before income taxes or extra debt payoffs.`:overdue.length?`Tax balance awaiting safe funding: ${total(overdue).toFixed(2)}.`:deferred?'Remaining balances are not yet affordable after the reserve and future obligations.':order.some(d=>outstanding(d)>0&&d.plannedPayoffDate?.slice(0,7)>r.month)?'Waiting for the planned payoff month.':order.length?'All affordable selected balances settled.':'No selected balances remain due.'
  const m={month:r.month,income:r.income,gross:r.gross,deductions:r.deductions,expenses:r.recurring,oneTime:r.oneTime,bonus:r.bonus,required,cashFlow,taxes,extra,endingCash:cash,available,unpaid:total(debts),reason}
  if(missed.length)m.reason+=` Planned payoff deferred: ${missed.map(d=>d.name).join(', ')}. Reserve protection and tax priority still apply.`
  months.push(m);append(r.date,`${monthName(r.date)} ending savings / cash`,0,m.unpaid,m.reason)
 }
 const end=inputs[a.months-1].date
 for(const d of debts.filter(d=>d.original&&d.balance>0&&taxKind(d)))taxDeadlines.push({id:d.id,name:d.name,amount:d.balance,dueDate:d.dueDate||a.start,paidDate:payoffs.find(p=>p.id===d.id)?.date||null})
 const lateTaxes=taxDeadlines.filter(t=>t.dueDate<=end&&(!t.paidDate||t.paidDate.slice(0,7)>t.dueDate.slice(0,7)))
 const knownKinds=new Set(a.expenses.filter(x=>x.enabled&&x.frequency==='annual').map(taxKind))
 return {months,daily:[],payoffs,ledger,taxDeadlines,lowest,firstShortfall,endingCash:cash,unpaid:total(debts),debtFree,nonTaxDebtFree,lateTaxes,
  warnings:[...(cash===null?['Enter opening cash or use a saved cash snapshot. The reserve target is not your opening balance.']:[]),...(lateTaxes.length?[`${lateTaxes.length} tax obligation(s) cannot be paid in the due month while preserving the reserve. Review the tax funding table.`]:[]),...(['property-tax','income-tax'].filter(k=>!knownKinds.has(k)).map(k=>`No ${k==='property-tax'?'property':'income'} tax assumption is recorded. Add the annual balance due, or explicitly record zero if none is owed.`)),
   'Interest uses estimated APR accrual; lender fees are not included.','Monthly income is prorated only by each source’s start/end dates, never by the planning start date. Actual payroll and bill-day liquidity can differ.','Future obligations are protected through the displayed horizon plus 12 months; future years retain the entered tax amounts and 2026 W-2 rules.','Unpaid tax balances already owed belong in Liabilities; future annual balances due belong in Expenses. Do not enter the same tax year twice.']}
}
