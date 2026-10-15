// A source worksheet is a hypothetical monthly plan, never a bank/ledger import.
export const WORKSHEET_ID = 'recovery-household-worst-case-002'
const money = value => Math.round(value * 100)
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
export function createRecoveryWorksheet() {
  const rows = [
    {id:'savings',month:'',label:'Savings',amount:9000,kind:'opening',financialStrategy:'',householdStrategy:''},
    {id:'severance',month:'',label:"Javin’s severance",amount:4000,kind:'opening',financialStrategy:'',householdStrategy:''},
    {id:'hoa',month:'',label:'HOA check',amount:4000,kind:'opening',financialStrategy:'',householdStrategy:''},
  ]
  for(let i=0;i<15;i++) {
    const date = new Date(Date.UTC(2026,9+i,1)), month=date.toISOString().slice(0,7)
    rows.push({id:`cash-${month}`,month,label:`${monthNames[date.getUTCMonth()]} cash flow`,amount:6604.09,kind:'cashflow',financialStrategy:i===0?'Nyla must find 2nd remote opportunity':i===1?'Javin must find remote opportunity to offset fuel cost and decrease wear and tear on vehicle':'',householdStrategy:i===0?'LJ needs work':i===1?'LS finds work':''})
    if(month==='2027-01'||month==='2027-10') rows.push({id:`tax-${month}`,month,label:month==='2027-01'?'2026 property tax payoff':'2027 property tax payoff',amount:-30337.59,kind:'obligation',financialStrategy:'',householdStrategy:month==='2027-10'?'2027 property tax due October 15 (source note)':''})
    if(month==='2027-10') rows.push({id:'income-tax',month,label:'LSTS income tax payoff',amount:-16000,kind:'obligation',financialStrategy:'',householdStrategy:''})
  }
  return {rows,sourceNotes:'Transcribed from “Addition of NS Income Worst Case Scenario.” Initial funds and cash flows are planning assumptions, not verified receipts. The final December row is labeled 2028 in the source; modeled as December 2027 to follow November 2027. “LSTS” and “NS” are retained as written. The income tax month is provisionally October 2027 based on row order. The source places the October property tax payoff after the full monthly cash flow despite noting an October 15 due date; this monthly worksheet does not establish cash available on that day.'}
}
export function validateWorksheet(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['rows','sourceNotes'].includes(k)))throw Error('Invalid source worksheet.')
  if(typeof input.sourceNotes!=='string'||input.sourceNotes.length>4000)throw Error('Source notes must be at most 4,000 characters.')
  if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>120)throw Error('A worksheet requires 1–120 planning rows.')
  const ids=new Set();let lastMonth=''
  const rows=input.rows.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!['id','month','label','amount','kind','financialStrategy','householdStrategy'].includes(k)))throw Error('Invalid worksheet row.')
    if(typeof row.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(row.id)||ids.has(row.id))throw Error('Worksheet rows require unique stable IDs.')
    ids.add(row.id)
    if(!['opening','cashflow','obligation'].includes(row.kind))throw Error('Invalid worksheet row type.')
    if(typeof row.month!=='string'||(row.kind==='opening'?row.month!==''||lastMonth!=='' : !/^20\d\d-(0[1-9]|1[0-2])$/.test(row.month)||row.month<lastMonth))throw Error('Opening funds must precede monthly rows, in chronological order.')
    if(row.month)lastMonth=row.month
    if(typeof row.amount!=='number'||!Number.isFinite(row.amount)||Math.abs(row.amount)>1e8)throw Error('Worksheet amounts must be finite planning amounts.')
    for(const field of ['label','financialStrategy','householdStrategy'])if(typeof row[field]!=='string'||row[field].length>1000||(field==='label'&&!row[field].trim()))throw Error('Worksheet labels and strategy notes must be valid text.')
    return {...row}
  })
  return {rows,sourceNotes:input.sourceNotes}
}
export function projectWorksheet(input) {
  const worksheet=validateWorksheet(input);let balance=0,opening=0,inflow=0,obligations=0
  const rows=worksheet.rows.map(row=>{
    const amount=money(row.amount);balance+=amount
    if(row.kind==='opening')opening+=amount
    else if(amount>=0)inflow+=amount
    else obligations-=amount
    return {...row,balance:balance/100,classification:'hypothetical'}
  })
  return {rows,opening:opening/100,inflow:inflow/100,obligations:obligations/100,closing:balance/100,negative:rows.some(row=>row.balance<0)}
}
