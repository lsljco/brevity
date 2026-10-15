import { validateWorksheet } from './recoveryWorksheet.js'
import { normalizeDebts } from './debtModel.js'

export const RECOVERY_ID = 'household-financial-recovery-001'
export const RECOVERY_DEFAULT = Object.freeze({
  title:'Household Financial Recovery / Vizient Opportunity', start:'2026-11-01', end:'2027-12-31',
  baselineMode:'confirmed', monthlySurplus:6604.09, paycheck:7500, monthlyIncome:15000,
  texasMonthly:7500, contingency:498.09, firstPayDate:'', texasStart:'2026-11-01', texasEnd:'2027-12-31',
  relocation:0, relocationDate:'', taxAmount:30000, taxDate:'', taxRecordId:'',
  reserve:0, extraDebt:0, strategy:'highest-rate',
})
const datePattern = /^\d{4}-\d{2}-\d{2}$/
export const validDate = value => datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value
const stamp = value => Date.parse(`${value}T12:00:00Z`)
const iso = ms => new Date(ms).toISOString().slice(0,10)
const day = 86400000
const cents = value => Math.round(value*100)
export function validateRecovery(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Scenario assumptions must be an object.')
  if (Object.keys(input).some(key => key!=='worksheet'&&!Object.hasOwn(RECOVERY_DEFAULT,key))) throw Error('Unsupported scenario assumption.')
  const result = {...RECOVERY_DEFAULT,...input}
  if (typeof result.title !== 'string' || !result.title.trim() || result.title.length>160) throw Error('A scenario name of up to 160 characters is required.')
  for (const field of ['start','end','texasStart','texasEnd','firstPayDate','relocationDate','taxDate']) {
    if (!result[field] && ['firstPayDate','relocationDate','taxDate'].includes(field)) continue
    if (!validDate(result[field])) throw Error(`${field} must be a valid calendar date.`)
  }
  if (result.end<result.start || stamp(result.end)-stamp(result.start)>day*366*5) throw Error('Planning horizon must be ordered and no longer than five years.')
  if(result.texasEnd<result.texasStart)throw Error('Texas allocation end precedes its start.')
  for (const field of ['monthlySurplus','paycheck','monthlyIncome','texasMonthly','contingency','relocation','taxAmount','reserve','extraDebt']) {
    if (typeof result[field]!=='number'||!Number.isFinite(result[field])||Math.abs(result[field])>1e8||(field!=='monthlySurplus'&&result[field]<0)) throw Error(`${field} must be a valid ${field==='monthlySurplus'?'':'non-negative '}amount.`)
  }
  if (!['confirmed','live'].includes(result.baselineMode)||!['highest-rate','lowest-balance'].includes(result.strategy)) throw Error('Invalid scenario method.')
  if(typeof result.taxRecordId!=='string'||result.taxRecordId.length>160)throw Error('Use an exact scheduled obligation ID.')
  if(input.worksheet!==undefined)result.worksheet=validateWorksheet(input.worksheet)
  return result
}
export function biweeklyDates(first, start, end) {
  if(!first)return []
  if(![first,start,end].every(validDate))throw Error('Payroll requires valid dates.')
  const dates=[]; let next=stamp(first)
  if(next<stamp(start))next+=Math.ceil((stamp(start)-next)/(14*day))*14*day
  for(;next<=stamp(end);next+=14*day)dates.push(iso(next))
  return dates
}
// Allocating integer cents cumulatively preserves the exact monthly total.
const dailyShare = (monthly,date) => {
  const d=new Date(stamp(date)), n=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(), index=d.getUTCDate()
  return Math.round(cents(monthly)*index/n)-Math.round(cents(monthly)*(index-1)/n)
}

export function projectRecovery(raw, {forecast=new Map(), debts=[]}={}, variant='expected', {minimumOnly=false}={}) {
  const a=validateRecovery(raw)
  if(!['baseline','conservative','expected','optimistic'].includes(variant))throw Error('Invalid scenario variant.')
  const payroll=new Set(biweeklyDates(a.firstPayDate,a.start,a.end))
  const previous=forecast.get(iso(stamp(a.start)-day))
  let cash=previous && Number.isFinite(previous.bal)?cents(previous.bal):null
  const opening=cash
  const rows=normalizeDebts(debts).filter(d=>d.status==='Active'&&d.currentBalance>0).map(d=>({...d,balance:cents(d.currentBalance)}))
  const unsupported=rows.some(d=>d.interestMethod!=='Amortized APR'||d.paymentsPerYear!==12)
  let interestTotal=0;const completed=[],daily=[],months=[],warnings=[]
  if(cash===null)warnings.push('No forecast opening cash anchor for the selected horizon. Balances and accelerated debt payments are unavailable.')
  const monthlyEstimate=!a.firstPayDate
  if(monthlyEstimate)warnings.push('Monthly what-if estimate: Vizient income and Texas costs are modeled together from the assumed opportunity start. Employment and payroll dates remain unconfirmed; pay-period timing is unavailable.')
  if(a.taxAmount&&!a.taxDate)warnings.push('Property tax payment date is unconfirmed; the obligation is not yet deducted.')
  if(a.relocation&&!a.relocationDate)warnings.push('Relocation timing is missing; the one-time cost is not yet deducted.')
  if(unsupported)warnings.push('Debt projection requires monthly amortized APR debts. Other interest methods need their own payment schedules; debt projections are unavailable.')
  let month=null, monthInterest=0
  for(let t=stamp(a.start);t<=stamp(a.end);t+=day){
    const date=iso(t),key=date.slice(0,7),p=forecast.get(date)
    if(!month||month.month!==key){
      month={month:key,baseline:0,payroll:0,texas:0,contingency:0,tax:0,relocation:0,extraDebt:0,interest:0,closing:null,minimum:null,debtBalance:null};months.push(month)
      monthInterest=0
      if(!unsupported)for(const debt of rows){const interest=Math.round(debt.balance*debt.interestRate/1200);debt.balance+=interest;monthInterest+=interest} 
      interestTotal+=monthInterest
    }
    let base=a.baselineMode==='live'?(Number.isFinite(p?.remainingDelta)?cents(p.remainingDelta):null):dailyShare(a.monthlySurplus,date)
    if(base===null)cash=null
    const active=variant!=='baseline'
    const opportunityActive=active&&(a.firstPayDate?key>=a.firstPayDate.slice(0,7):date>=a.texasStart)
    let income=0
    // Expected and conservative cap each month's dated income at the planning allowance.
    if(active&&payroll.has(date))income=variant==='optimistic'?cents(a.paycheck):Math.min(cents(a.paycheck),Math.max(0,cents(a.monthlyIncome)-month.payroll))
    if(opportunityActive&&monthlyEstimate)income=dailyShare(a.monthlyIncome,date)
    const texas=opportunityActive&&date>=a.texasStart&&date<=a.texasEnd?dailyShare(a.texasMonthly,date):0
    const contingency=opportunityActive&&variant==='conservative'?dailyShare(a.contingency,date):0
    const relocation=active&&date===a.relocationDate?cents(a.relocation):0
    // A linked obligation already appears in the live forecast. Never subtract it twice.
    const linkedTax=a.baselineMode==='live'&&a.taxRecordId
    const tax=date===a.taxDate&&!linkedTax?cents(a.taxAmount):0
    if(cash!==null)cash+=(base||0)+income-texas-contingency-relocation-tax
    month.baseline+=base||0;month.payroll+=income;month.texas+=texas;month.contingency+=contingency;month.tax+=tax;month.relocation+=relocation
    let extra=0
    const monthEnd=iso(t+day).slice(0,7)!==key
    if(monthEnd&&!unsupported){
      // Minimum debt payments are ALREADY included in baseline expenses; do not debit cash again.
      for(const debt of rows)debt.balance=Math.max(0,debt.balance-Math.min(debt.balance,cents(debt.minimumPayment)))
      let pool=minimumOnly||cash===null?0:Math.min(cents(a.extraDebt),Math.max(0,cash-cents(a.reserve)))
      const ordered=[...rows].sort(a.strategy==='lowest-balance'?(x,y)=>x.balance-y.balance:(x,y)=>y.interestRate-x.interestRate)
      for(const debt of ordered){const payment=Math.min(debt.balance,pool);debt.balance-=payment;pool-=payment;extra+=payment}
      if(cash!==null)cash-=extra
      for(const debt of rows)if(debt.balance===0&&!completed.some(d=>d.id===debt.id))completed.push({id:debt.id,creditor:debt.creditor,date})
    }
    month.extraDebt+=extra;month.interest=monthInterest;month.closing=cash;month.minimum=cash===null?null:Math.min(month.minimum??cash,cash);month.debtBalance=unsupported?null:rows.reduce((s,d)=>s+d.balance,0)
    daily.push({date,baseline:base===null?null:base/100,payroll:income/100,texas:texas/100,tax:tax/100,relocation:relocation/100,extraDebt:extra/100,balance:cash===null?null:cash/100,classification:'hypothetical',payday:payroll.has(date)})
  }
  if(daily.some(d=>d.balance<0&&d.balance!==null))warnings.push('Projected cash falls below zero. Accelerated payments stop when reserves are unavailable.')
  const normalizedMonths=months.map(m=>Object.fromEntries(Object.entries(m).map(([k,v])=>[k,k==='month'||v===null?v:v/100])))
  return {variant,monthlyEstimate,opening:opening===null?null:opening/100,months:normalizedMonths,daily,warnings,completed:unsupported?[]:completed,totalInterest:unsupported?null:interestTotal/100,payoffDate:!unsupported&&rows.length&&rows.every(d=>d.balance===0)?completed.at(-1)?.date:null,remainingDebt:unsupported?null:rows.reduce((s,d)=>s+d.balance,0)/100}
}
