import {RECOVERY_DEFAULT} from './recoveryScenario.js'
import {createRecoveryWorksheet,projectWorksheet} from './recoveryWorksheet.js'
export const WORK_SCENARIOS = [
  {id:'recovery-larry-work',title:'Larry returns to work',monthly:14604.09,texas:0,debtMonths:['2027-02','2027-03','2027-04','2027-05','2027-07','2027-07']},
  {id:'recovery-both-work',title:'Larry and Lorenzo return to work',monthly:22604.09,texas:0,debtMonths:['2027-01','2027-01','2027-02','2027-03','2027-04','2027-04']},
  {id:'recovery-both-vizient',title:'Larry and Lorenzo — Vizient',monthly:29604.09,texas:7500,debtMonths:['2026-12','2026-12','2027-01','2027-02','2027-03','2027-03']},
]
const debtItems=[['capital-one','LS Capital One',10475.86],['synchrony','LJ Synchrony',9778.37],['ts','TS payoff',14000],['discover','LJ Discover',26000],['prosper-1','LJ Prosper Loan 1/2',17136.47],['prosper-2','LJ Prosper Loan 2/2',17136.47]]
const entry=(id,month,label,amount,kind='obligation')=>({id,month,label,amount,kind,financialStrategy:'',householdStrategy:''})
export function createWorkScenario(id) {
  const config=WORK_SCENARIOS.find(s=>s.id===id)
  if(!config)throw Error('Unknown named work scenario.')
  const vizient=config.texas>0, rows=createRecoveryWorksheet().rows.filter(r=>r.kind==='opening')
  for(let i=0;i<15;i++) {
    const d=new Date(Date.UTC(2026,9+i,1)),month=d.toISOString().slice(0,7)
    if(month==='2027-10'&&id!=='recovery-larry-work')rows.push(entry('tax-2027',month,'2027 property tax payoff',-30337.59))
    const cash=entry(`cash-${month}`,month,`${d.toLocaleString('en-US',{month:'long',timeZone:'UTC'})} household surplus before Texas`,i?config.monthly:6604.09,'cashflow')
    if(i===0){cash.financialStrategy='Nyla must find 2nd remote opportunity';cash.householdStrategy='LJ needs work; delete apps on all devices (worksheet note only)'}
    if(i===1){cash.financialStrategy='Javin must find remote opportunity to offset fuel cost and decrease wear and tear on vehicle';cash.householdStrategy='LS finds work; TS finds work'}
    rows.push(cash)
    if(vizient&&i)rows.push(entry(`texas-${month}`,month,'Texas living and travel allocation',-7500))
    if(month===(vizient?'2026-11':'2026-12'))rows.push(entry('tax-2026',month,'2026 property tax payoff',-30337.59))
    if(month==='2027-01')rows.push(entry('income-tax',month,'LSTS income tax payoff',-16000))
    debtItems.forEach(([key,label,amount],index)=>{if(config.debtMonths[index]===month)rows.push(entry(key,month,label,-amount))})
    if(month==='2027-10'&&id==='recovery-larry-work')rows.push(entry('tax-2027',month,'2027 property tax payoff',-30337.59))
  }
  const sourceNotes='From the supplied return-to-work worksheet, October 2026–December 2027 (the complete common horizon; partial 2028 continuation is not extrapolated). Opening planning funds: $9,000 savings + $4,000 severance + $4,000 HOA check. October surplus is $6,604.09. Additional work income begins hypothetically in November. Debts and taxes follow the source payoff order, without inventing interest rates or matching live debts by name. Both Prosper rows are preserved as separate $17,136.47 payoffs; the source labels both “1/2.” Month-level tax placement does not establish cash available on the 15th. Employment and receipts are unconfirmed.'+(vizient?' Vizient subtotal is $6,604.09 + $8,000 Larry + $15,000 Lorenzo = $29,604.09. Per the Texas instruction, subtract $7,500 living/travel separately: $22,104.09 household contribution available each month. The source omits this Texas allocation. Its displayed December 2027 balance $262,177.99 also contains arithmetic discrepancies: entered source amounts recompute to $266,859.00 before Texas, or $161,859.00 after 14 Texas allocations. Balances here are recalculated, not copied.':'')
  return {...RECOVERY_DEFAULT,title:config.title,start:'2026-10-01',end:'2027-12-31',paycheck:0,monthlyIncome:0,texasMonthly:0,contingency:0,taxAmount:0,worksheet:{rows,sourceNotes}}
}
export function summarizeWorkScenario(assumptions) {
  const result=projectWorksheet(assumptions.worksheet),monthly=new Map()
  for(const row of result.rows)if(row.month)monthly.set(row.month,row.balance)
  const cash=result.rows.filter(r=>r.kind==='cashflow'&&r.month>='2026-11')
  const texas=result.rows.filter(r=>r.id.startsWith('texas-'))
  const monthlyBefore=cash[0]?.amount??0,allocation=-(texas[0]?.amount??0)
  return {...result,monthly,monthlyBefore,allocation,monthlyAfter:Math.round((monthlyBefore-allocation)*100)/100}
}
