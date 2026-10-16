// October 15 Models, LSLJ_Financial_Strategy_10.07.2026.xlsx.
// This is the worksheet's Phoenix-implied net proxy, not a tax calculation.
export const NET_RETENTION = 6122.88 / (55 * 40 * 52 / 12)
export const OPPORTUNITY_SCENARIOS = [
  ['phoenix','Phoenix Children’s — $55/hr',55,'hourly','Lawson Supply Chain Analyst','Rate accepted by Larry; submission not confirmed. Original term 8+ months.'],
  ['vcu-60','VCU Health — $60/hr',60,'hourly','Senior ERP Applications Analyst','Recruiter discussion. Initial rate. 5 months per email; listing says 4. Travel unresolved.'],
  ['vcu-75','VCU Health — proposed $75/hr',75,'hourly','Senior ERP Applications Analyst','Proposed W2 rate, not accepted. Travel reimbursement requested separately.'],
  ['ykk-125','YKK — $125,000',125000,'annual','Process Manager, SCM / P2P','Interview activity; completion/date unconfirmed in pipeline. Lower end of stated range.'],
  ['ykk-140','YKK — $140,000',140000,'annual','Process Manager, SCM / P2P','Upper end of stated range. Employment basis and final compensation unconfirmed.'],
  ['wipro','Wipro — $220,000 total',220000,'annual','Supply Chain Managing Consultant','Recruiter screen. Includes quarterly bonus. Monthly average only; base and payout split unknown.'],
  ['bose','Bose — indicative $152,800',152800,'annual','Senior Global Process Owner, Finance','Prior Aug 31 application. No new submission confirmed. Framingham range $152,800–$210,100; Atlanta compensation unknown.'],
  ['expedite','Expedite — rate pending',null,'hourly','Program Manager, Government Contracts','Outreach only. Rate missing. Original term through October 11, 2027.'],
].map(([key,title,gross,basis,role,status])=>({id:`recovery-oct15-${key}`,title,gross,basis,role,status}))
export function validateOpportunityIncome(input) {
  const keys=['gross','basis','hours','weeks','retention','costs','start','end']
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(input,k)))throw Error('Invalid opportunity income assumptions.')
  if(!['hourly','annual'].includes(input.basis))throw Error('Choose hourly or annual compensation.')
  for(const [key,max] of [['gross',1e7],['hours',168],['weeks',53],['retention',1],['costs',1e8]]) {
    if(key==='gross'&&input[key]===null)continue
    if(typeof input[key]!=='number'||!Number.isFinite(input[key])||input[key]<0||input[key]>max)throw Error(`Invalid opportunity ${key}.`)
  }
  if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(input.start)||!/^20\d\d-(0[1-9]|1[0-2])$/.test(input.end)||input.end<input.start)throw Error('Opportunity months must be chronological.')
  return {...input}
}
export function opportunityMonthly(input) {
  const a=validateOpportunityIncome(input)
  if(a.gross===null)return null
  const gross=a.basis==='hourly'?a.gross*a.hours*a.weeks/12:a.gross/12
  return {gross,net:gross*a.retention,costs:a.costs}
}
