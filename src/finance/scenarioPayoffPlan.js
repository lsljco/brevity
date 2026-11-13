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
 if(a.planningVersion!==2){a.cashFloor=Math.max(DEFAULT_STUDIO_RESERVE,a.cashFloor||0);a.projectionMode='monthly';a.planningVersion=2}
 return a
}
export function savedScenarioCash(accounts=[]){
 const cash=accounts.filter(a=>['checking','savings'].includes(a.type))
 if(!cash.length||cash.some(a=>!a.plaidAccountId||!Number.isFinite(a.plaidCurrentBalance))||new Set(cash.map(a=>a.plaidAccountId)).size!==cash.length)return null
 return round(cash.reduce((s,a)=>s+a.plaidCurrentBalance,0))
}
const outstanding=debt=>round(Math.max(0,debt.remaining+debt.interest))
const total=debts=>round(debts.reduce((s,d)=>s+outstanding(d),0))
function minimum(debt,days){
 if(!debt.remaining||taxKind(debt))return 0
 if(debt.method!=='Principal only')debt.interest+=debt.remaining*debt.apr/100*days/365
 const payment=round(Math.min(outstanding(debt),debt.payment)),interest=Math.min(payment,debt.interest)
 debt.interest-=interest;debt.remaining=round(Math.max(0,debt.remaining-payment+interest))
 if(outstanding(debt)<.005){debt.remaining=0;debt.interest=0}
 return payment
}
function periodInputs(a,count){
 const first=new Date(stamp(a.start)),cache=new Map(),rows=[]
 for(let index=0;index<count;index++){
  const begin=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+index,1,12)),end=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+index+1,0,12))
  const start=index===0?a.start:iso(begin),last=iso(end),days=end.getUTCDate(),r={date:last,month:last.slice(0,7),days:Math.round((stamp(last)-stamp(start))/DAY)+1,income:0,gross:0,deductions:0,expenses:0,taxBills:[]}
  for(let t=stamp(start);t<=stamp(last);t+=DAY){
   const date=iso(new Date(t)),active=a.incomes.filter(x=>x.enabled&&x.start<=date&&(!x.end||x.end>=date)),key=JSON.stringify(active.map(x=>x.id))
   if(!cache.has(key))cache.set(key,calculateIncomeRows(active,a.profiles))
   const incomes=cache.get(key)
   const net=incomes.reduce((s,x)=>s+x.monthlyNet,0),gross=incomes.reduce((s,x)=>s+x.annualGross/12,0)
   r.income+=net/days;r.gross+=gross/days
   if(incomes.some(x=>!x.annualGross&&x.monthlyNet>0))r.deductions=null
   else if(r.deductions!==null)r.deductions+=(gross-net)/days
   for(const x of a.expenses.filter(x=>x.enabled&&x.start<=date&&(!x.end||x.end>=date))){
    if(factors[x.frequency])r.expenses+=x.amount*factors[x.frequency]/12/days
    else if((x.frequency==='once'&&x.start===date)||(x.frequency==='annual'&&date.slice(5,7)===x.start.slice(5,7)&&Number(date.slice(8))===Math.min(Number(x.start.slice(8)),days))){
     const kind=taxKind(x)
     if(kind){const year=Number(date.slice(0,4))-(kind==='income-tax'?1:0);r.taxBills.push({id:`${x.id}:${date}`,name:x.frequency==='once'?`${x.name}${/payoff$/i.test(x.name)?'':' payoff'}`:`${year} ${kind==='property-tax'?'property':'income'} tax payoff`,amount:x.amount,dueDate:date,taxKind:kind})}
     else r.expenses+=x.amount
    }
   }
  }
  for(const key of ['income','gross','expenses'])r[key]=round(r[key]);if(r.deductions!==null)r.deductions=round(r.deductions)
  rows.push(r)
 }
 return rows
}
// Recompute actual remaining amortization after each candidate settlement.
// Do not reserve payments for a debt that is already paid, or for payments
// beyond its natural maturity. Annual taxes are included beyond the visible horizon.
function fundingNeed(inputs,index,current,excludedId,protectTaxes=true){
 const debts=current.filter(d=>d.id!==excludedId&&outstanding(d)>0&&(protectTaxes||!taxKind(d))).map(d=>({...d}))
 let running=-debts.filter(d=>taxKind(d)&&(!d.dueDate||d.dueDate<=inputs[index].date)).reduce((s,d)=>{const amount=outstanding(d);d.remaining=0;d.interest=0;return s+amount},0),need=Math.max(0,-running)
 for(let i=index+1;i<inputs.length;i++){
  const r=inputs[i];let required=0
  for(const d of debts){
   if(taxKind(d)){if(outstanding(d)&&d.dueDate<=r.date){required+=outstanding(d);d.remaining=0;d.interest=0}}
   else required+=minimum(d,r.days)
  }
  running=round(running+r.income-r.expenses-required-(protectTaxes?r.taxBills.reduce((s,t)=>s+t.amount,0):0));need=Math.max(need,-running)
 }
 return round(need)
}
export function projectMonthlyStudio(a){
 const inputs=periodInputs(a,a.months+12),debts=a.liabilities.map(d=>({...d,remaining:d.balance,interest:0,original:true,taxKind:taxKind(d)}))
 const originalIds=new Set(debts.filter(d=>d.balance>0).map(d=>d.id)),payoffs=[],months=[],ledger=[],taxDeadlines=[]
 let cash=a.openingCash,lowest=cash===null?null:cash-a.protectedReserve,firstShortfall=cash!==null&&lowest<a.cashFloor?{date:a.start,amount:round(a.cashFloor-lowest)}:null,debtFree=null
 const append=(date,description,amount,unpaid,note='')=>ledger.push({year:Number(date.slice(0,4)),month:monthName(date),date,description,amount,cashBalance:cash,protectedReserve:round(a.cashFloor+a.protectedReserve),unpaidLiabilities:unpaid,note})
 append(a.start,'Opening savings / cash',0,total(debts),a.openingCash===null?'Opening cash is required.':'Starting balance, not new income.')
 for(let index=0;index<a.months;index++){
  const r=inputs[index],events=[];let required=0,extra=0,taxes=0
  for(const d of debts){
   const before=outstanding(d),payment=minimum(d,r.days);required=round(required+payment)
   if(before>0&&outstanding(d)===0){const p={date:r.date,name:d.name,amount:payment,releasedMonthly:d.payment,source:'required',id:d.id};payoffs.push(p);events.push(p)}
  }
  for(const bill of r.taxBills){if(bill.amount>0)debts.push({...bill,balance:bill.amount,remaining:bill.amount,interest:0,payment:0,apr:0,include:true,method:'Principal only',original:false});taxDeadlines.push({...bill,paidDate:bill.amount===0?r.date:null})}
  const cashFlow=round(r.income-r.expenses-required)
  if(cash!==null)cash=round(cash+cashFlow)
  append(r.date,`${monthName(r.date)} cash flow`,cashFlow,total(debts),`Net income ${r.income.toFixed(2)} less living / one-time costs ${r.expenses.toFixed(2)} and required payments ${required.toFixed(2)}. Annual tax settlements are separate.`)
  const order=debts.filter(d=>d.include&&outstanding(d)>0&&(!taxKind(d)||!d.dueDate||d.dueDate<=r.date)).sort((x,y)=>{
   if(Boolean(taxKind(x))!==Boolean(taxKind(y)))return taxKind(x)?-1:1
   if(taxKind(x))return (x.dueDate||a.start).localeCompare(y.dueDate||a.start)
   return a.strategy==='highest-apr'?y.apr-x.apr:a.strategy==='lowest-balance'?outstanding(x)-outstanding(y):0
  })
  let deferred=0
  for(const d of order){
   const settlement=outstanding(d)
   if(cash===null)continue
   if(cash-settlement<a.cashFloor+a.protectedReserve){deferred++;continue}
   const need=fundingNeed(inputs,index,debts,d.id,!taxKind(d))
   if(round(cash-settlement-a.cashFloor-a.protectedReserve)<need){deferred++;continue}
   cash=round(cash-settlement);d.remaining=0;d.interest=0
   const isTax=Boolean(taxKind(d));if(isTax)taxes=round(taxes+settlement);else extra=round(extra+settlement)
   const p={date:r.date,name:d.name,amount:settlement,releasedMonthly:d.payment,source:isTax?'tax':'extra',id:d.id};payoffs.push(p)
   const bill=taxDeadlines.find(t=>t.id===d.id);if(bill)bill.paidDate=r.date
   append(r.date,/payoff$/i.test(d.name)?d.name:`${d.name} payoff`,-settlement,total(debts),isTax?'Tax balance paid; payroll withholding is not charged again.':`Required monthly payment of ${d.payment.toFixed(2)} stops next month.`)
  }
  for(const event of events)append(r.date,`${event.name} paid off through required payments`,0,total(debts),`Final required payment ${event.amount.toFixed(2)} is already included in monthly cash flow.`)
  if(!debtFree&&originalIds.size&&debts.filter(d=>originalIds.has(d.id)).every(d=>outstanding(d)===0))debtFree=r.date
  const available=cash===null?null:round(cash-a.protectedReserve)
  if(cash!==null){lowest=Math.min(lowest,available);if(available<a.cashFloor&&!firstShortfall)firstShortfall={date:r.date,amount:round(a.cashFloor-available)}}
  const overdue=debts.filter(d=>taxKind(d)&&outstanding(d)>0&&(!d.dueDate||d.dueDate<=r.date))
  const reason=cash===null?'Enter opening cash to calculate payoff dates.':available<a.cashFloor?`Rebuilding reserve: ${round(a.cashFloor-available).toFixed(2)} below target.`:overdue.length?`Tax balance awaiting safe funding: ${total(overdue).toFixed(2)}.`:deferred?'Remaining balances are not yet affordable after the reserve and future obligations.':order.length?'All affordable selected balances settled.':'No selected balances remain due.'
  const m={month:r.month,income:r.income,gross:r.gross,deductions:r.deductions,expenses:r.expenses,required,cashFlow,taxes,extra,endingCash:cash,available,unpaid:total(debts),reason}
  months.push(m);append(r.date,`${monthName(r.date)} ending savings / cash`,0,m.unpaid,reason)
 }
 const end=inputs[a.months-1].date
 for(const d of debts.filter(d=>d.original&&d.balance>0&&taxKind(d)))taxDeadlines.push({id:d.id,name:d.name,amount:d.balance,dueDate:d.dueDate||a.start,paidDate:payoffs.find(p=>p.id===d.id)?.date||null})
 const lateTaxes=taxDeadlines.filter(t=>t.dueDate<=end&&(!t.paidDate||t.paidDate.slice(0,7)>t.dueDate.slice(0,7)))
 const knownKinds=new Set(a.expenses.filter(x=>x.enabled&&x.frequency==='annual').map(taxKind))
 return {months,daily:[],payoffs,ledger,taxDeadlines,lowest,firstShortfall,endingCash:cash,unpaid:total(debts),debtFree,lateTaxes,
  warnings:[...(cash===null?['Enter opening cash or use a saved cash snapshot. The reserve target is not your opening balance.']:[]),...(lateTaxes.length?[`${lateTaxes.length} tax obligation(s) cannot be paid in the due month while preserving the reserve. Review the tax funding table.`]:[]),...(['property-tax','income-tax'].filter(k=>!knownKinds.has(k)).map(k=>`No ${k==='property-tax'?'property':'income'} tax assumption is recorded. Add the annual balance due, or explicitly record zero if none is owed.`)),
   'Interest uses estimated APR accrual; lender fees are not included.','Monthly planning estimates prorate the first month and income start/end dates. Actual payroll and bill-day liquidity can differ.','Future obligations are protected through the displayed horizon plus 12 months; future years retain the entered tax amounts and 2026 W-2 rules.','Unpaid tax balances already owed belong in Liabilities; future annual balances due belong in Expenses. Do not enter the same tax year twice.']}
}
