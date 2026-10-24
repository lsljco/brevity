// Dependency-free contract shared by Action Mode and the lazy report workspace.
const CADENCES=new Set(['daily','weekly','monthly','quarterly','yearly'])
export const PACKET_EDIT_ROOTS=new Set(['cashBalance','posted','prior','pending','categoryBudget','monthly','payables','projectedInflows','pendingItems','creditCards','priorDayObservations','budgetMilestones','agenda','inputs','deliverables','warnings','notes','analysis','openActions','duration'])
export function normalizePacketEdit(payload={}){
  const allowed=['packetId','cadence','scope','field','value','reason','reset']
  if(Object.keys(payload).some(k=>!allowed.includes(k)))throw Error('Unsupported report edit field.')
  if(!CADENCES.has(payload.cadence)||!new RegExp(`^${payload.cadence}:(current|previous):\\d{4}-\\d{2}-\\d{2}$`).test(payload.packetId||''))throw Error('A valid report period is required.')
  if(!['period','cadence'].includes(payload.scope))throw Error('Choose this report period or this cadence going forward.')
  if(typeof payload.field!=='string'||payload.field.length>1200||!PACKET_EDIT_ROOTS.has(payload.field.split('/')[0])||/(__proto__|prototype|constructor)/.test(payload.field))throw Error('Choose an editable report field.')
  if(payload.reset!==true&&payload.value!==null&&typeof payload.value!=='string'&&!(typeof payload.value==='number'&&Number.isFinite(payload.value)))throw Error('Use text, a finite number or an explicit unknown value.')
  if(typeof payload.value==='string'&&payload.value.length>12000)throw Error('Report text is limited to 12,000 characters per field.')
  const reason=String(payload.reason||'Household report adjustment').trim().slice(0,1000)
  return {packetId:payload.packetId,cadence:payload.cadence,scope:payload.scope,field:payload.field,...(payload.reset===true?{reset:true}:{value:payload.value}),reason}
}
export function packetEditReviewFields(json){
  try{const e=normalizePacketEdit(JSON.parse(json));return [['report field',e.field],['reported value',e.reset?'Restore automatic value':e.value===null?'Unknown':e.value],['applies to',e.scope==='cadence'?'This meeting cadence going forward':'This report period'],['reason',e.reason],['source records','Retained unchanged; reported values and dependent analysis update']]}
  catch{return [['report adjustment','Invalid; cannot apply']]}
}
