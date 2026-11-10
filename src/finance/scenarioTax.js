// Verified 2026 W-2 planning rules. Future projections deliberately freeze this
// rule year until a new version is verified; this is not a payroll/W-4 service.
export const TAX_SOURCES = [
 'https://www.irs.gov/publications/p505',
 'https://dor.georgia.gov/taxes/important-tax-updates',
 'https://dor.georgia.gov/document/document-document/2026-employers-tax-guide-updated-june-2026/download',
 'https://www.ssa.gov/oact/COLA/cbbdet.html',
 'https://www.irs.gov/businesses/small-businesses-self-employed/questions-and-answers-for-the-additional-medicare-tax',
]
const tables = {
 single:[16100,[12400,50400,105700,201775,256225,640600],200000],
 joint:[32200,[24800,100800,211400,403550,512450,768700],250000],
 separate:[16100,[12400,50400,105700,201775,256225,384350],125000],
 head:[24150,[17700,67450,105700,201750,256200,640600],200000],
}
export const TAX_PROFILE = {year:2026,state:'GA',filing:'single',dependents:0,credits:0,otherGross:0,otherPretax:0}
export const round = n => Math.round((n + Number.EPSILON)*100)/100
export function progressiveTax(income, edges) {
 let tax=0, lower=0
 for(const [i,upper] of [...edges,Infinity].entries()) {tax+=Math.max(0,Math.min(income,upper)-lower)*[.1,.12,.22,.24,.32,.35,.37][i];lower=upper}
 return tax
}
function incomeTaxes(gross, pretax, p) {
 const [deduction,edges,threshold]=tables[p.filing]
 const taxable=Math.max(0,gross-pretax)
 return {
 federal:Math.max(0,progressiveTax(Math.max(0,taxable-deduction),edges)-p.credits),
 state:Math.max(0,taxable-(p.filing==='joint'?30000:15000)-5000*p.dependents)*.0499,
 additionalMedicare:Math.max(0,gross-threshold)*.009,
 }
}
export function calculateIncomeRows(incomes, profiles) {
 const result=new Map()
 for(const person of new Set(incomes.map(r=>r.person))) {
  const rows=incomes.filter(r=>r.person===person), estimated=rows.filter(r=>r.mode==='gross'), known=rows.filter(r=>r.mode==='net')
  const p={...TAX_PROFILE,...profiles[person]}
  if(estimated.length&&known.some(r=>r.monthlyNet>0&&!r.annualGross))throw Error(`Enter existing annual gross for ${person} before estimating added income, or use known net pay.`)
  if(estimated.length && (p.year!==2026||p.state!=='GA'||!tables[p.filing]))throw Error('Gross-to-net estimates support verified 2026 Georgia W-2 rules. Use known take-home for other tax situations.')
  const baseGross=p.otherGross+known.reduce((s,r)=>s+r.annualGross,0)
  const basePretax=p.otherPretax+known.reduce((s,r)=>s+r.pretax,0)
  const before=estimated.length?incomeTaxes(baseGross,basePretax,p):{}
  const added=estimated.reduce((s,r)=>s+r.annualGross,0)
  const after=estimated.length?incomeTaxes(baseGross+added,basePretax+estimated.reduce((s,r)=>s+r.pretax,0),p):{}
  for(const r of rows) {
   if(r.mode==='net'){result.set(r.id,{...r,monthlyNet:r.monthlyNet,taxes:null,method:'Known take-home'});continue}
   const share=added?r.annualGross/added:0
   // Social Security withholding is capped per employer, not across employers:
   // do not treat a possible excess-withholding refund as available payday cash.
   const tax={federal:(after.federal-before.federal)*share,state:(after.state-before.state)*share,
    socialSecurity:Math.min(r.annualGross,184500)*.062,medicare:r.annualGross*.0145,
    additionalMedicare:(after.additionalMedicare-before.additionalMedicare)*share}
   const annualTax=Object.values(tax).reduce((a,b)=>a+b,0)
   result.set(r.id,{...r,monthlyNet:round(Math.max(0,r.annualGross-annualTax-r.pretax-r.posttax-r.extraWithholding)/12),taxes:Object.fromEntries(Object.entries(tax).map(([k,v])=>[k,round(v)])),method:'2026 GA W-2 estimate'})
  }
 }
 return incomes.map(r=>result.get(r.id))
}
