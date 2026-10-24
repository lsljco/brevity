import {MEETING_POLICIES} from './meetingPackets.js'

export const packetIdentity=p=>`${p.cadence}:${p.period.mode}:${p.period.from}`
export function packetEditReviewFields(json){
  try{const e=normalizePacketEdit(JSON.parse(json));return [['report field',e.field],['reported value',e.reset?'Restore automatic value':e.value===null?'Unknown':e.value],['applies to',e.scope==='cadence'?'This meeting cadence going forward':'This report period'],['reason',e.reason],['source records','Retained unchanged; reported values and dependent analysis update']]}
  catch{return [['report adjustment','Invalid; cannot apply']]}
}
const clone=value=>JSON.parse(JSON.stringify(value))
const dollars=n=>n==null?'unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n)
const known=n=>typeof n==='number'&&Number.isFinite(n)
const sum=rows=>rows.reduce((n,r)=>n+Number(r.amount||0),0)
const rowKey=(row,index)=>typeof row==='string'?row:String(row.id??row.category??row.month??row.name??index)
const encode=value=>encodeURIComponent(String(value))
const roots=new Set(['cashBalance','posted','prior','pending','categoryBudget','monthly','payables','projectedInflows','pendingItems','creditCards','priorDayObservations','budgetMilestones','agenda','inputs','deliverables','warnings','notes','analysis','openActions','duration'])

// No population work is required: these recommendations are calculated from
// the current report even when the language-model service is unavailable.
export function analyzeMeetingPacket(p){
  const unconfirmed=p.payables.filter(r=>r.status!=='Reconciled to posted charge')
  const obligation=sum(unconfirmed),inflows=sum(p.projectedInflows),shortfall=known(p.cashBalance)?Math.max(0,obligation-p.cashBalance-inflows):null
  const over=p.categoryBudget.filter(r=>known(r.remaining)&&r.remaining<0)
  const overdue=p.openActions.filter(a=>a.overdue)
  const actions=[]
  const add=(id,text,due=p.asOf,owner='Larry')=>actions.push({id,text,owner:/^Terica/i.test(owner)?'Terica':/^Lorenzo/i.test(owner)?'Lorenzo':'Larry',due,status:'Suggested'})
  if(p.sources.balanceDataStatus!=='fresh'||p.sources.transactionFreshnessStatus!=='fresh')add('verify-sources','Review the existing bank connection and latest sync errors; resolve missing or stale sources before cash decisions.')
  if(shortfall>0)add('cash-gap',`Review ${dollars(shortfall)} of scheduled cash exposure. Confirm expected receipts and prioritize due obligations before discretionary commitments.`)
  for(const row of over.slice(0,5))add(`variance-${row.category}`,`Review ${row.category}: posted spending exceeds the saved target by ${dollars(-row.remaining)}. Confirm categorization and reduce or reschedule remaining discretionary commitments.`)
  if(overdue.length)add('overdue-actions',`Follow up on ${overdue.length} overdue commitment${overdue.length===1?'':'s'}; confirm completion or agree a revised deadline.`)
  if(p.categoryBudget.some(r=>r.missingTargets))add('budget-coverage','Use the automatically prepared schedule baseline for planning where an approved budget target is unavailable. Treat the baseline as a forecast and confirm variances during the review.')
  const next=unconfirmed[0]
  if(next)add('next-payable',`Confirm payment status and cash coverage for ${next.title}, ${dollars(next.amount)}, due ${next.date}.`,next.date,next.owner)
  for(const m of p.budgetMilestones)if(m.due>=p.asOf&&Number(m.due.slice(0,4))===Number(p.asOf.slice(0,4))&&p.asOf.slice(5)>='09-01')add(`budget-${m.due}`,`Confirm evidence that the ${m.title.toLowerCase()} milestone is met.`,m.due,m.owner)
  if(!actions.length)add('maintain-plan','Review the next scheduled obligations and maintain the current spending plan; no additional exception was identified in the available records.')
  const delta=known(p.posted?.net)&&known(p.prior?.net)?p.posted.net-p.prior.net:null
  return {
    summary:`${p.label} review: posted net ${dollars(p.posted?.net)}; prior-period net ${dollars(p.prior?.net)}${delta==null?'':`; change ${dollars(delta)}`}. ${over.length} category overage${over.length===1?'':'s'} and ${overdue.length} overdue commitment${overdue.length===1?'':'s'} are visible in the retained records.`,
    direction:shortfall>0?'Prioritize near-term cash coverage and resolve the largest category deviations first.':'Confirm source freshness, protect scheduled obligations and address the exceptions below.',
    insights:[`Scheduled obligations ${dollars(obligation)} and expected inflows ${dollars(inflows)} through ${p.horizon.to}. These are projections, not confirmation of payment or receipt.`,shortfall==null?'Cash exposure cannot be assessed until a balance is available.':`Potential scheduled cash exposure: ${dollars(shortfall)}. This is not a reconciled ending-balance forecast and pending holds may overlap.`,...over.map(r=>`${r.category}: ${dollars(r.posted)} posted against ${dollars(r.budget)} target.`),`Source quality: balances ${p.sources.balanceDataStatus}; transactions ${p.sources.transactionFreshnessStatus}. Historical coverage remains unverified.`].join('\n'),
    actions:actions.map(a=>`${a.text}\nOwner: ${a.owner}. Proposed deadline: ${a.due}.`).join('\n\n'),
    recommendations:actions,mode:'Calculated analysis',
  }
}

// The registry is built from the actual report. Array rows use durable IDs,
// categories or months rather than their current display order.
export function editablePacketFields(packet){
  const fields=[]
  const walk=(value,path,label,parent,key)=>{
    if(typeof value==='number'||value===null||typeof value==='string'){
      if(['id','category','month','missingTargets','overdue','missingOwner','missingDeadline','mode'].includes(String(key)))return
      fields.push({field:path,label,type:typeof value==='number'||value===null?'number':'text',value,parent,key});return
    }
    if(Array.isArray(value)){value.forEach((row,i)=>walk(row,`${path}/${encode(rowKey(row,i))}`,`${label} · ${typeof row==='object'?row.title||row.name||row.category||row.month||row.text||i+1:i+1}`,value,i));return}
    if(value&&typeof value==='object')Object.entries(value).forEach(([k,v])=>walk(v,`${path}/${encode(k)}`,`${label} · ${k}`,value,k))
  }
  for(const key of roots)if(Object.hasOwn(packet,key))walk(packet[key],key,key,packet,key)
  return fields
}

export function normalizePacketEdit(payload={}){
  const allowed=['packetId','cadence','scope','field','value','reason','reset']
  if(Object.keys(payload).some(k=>!allowed.includes(k)))throw Error('Unsupported report edit field.')
  if(!MEETING_POLICIES[payload.cadence]||!new RegExp(`^${payload.cadence}:(current|previous):\\d{4}-\\d{2}-\\d{2}$`).test(payload.packetId||''))throw Error('A valid report period is required.')
  if(!['period','cadence'].includes(payload.scope))throw Error('Choose this report period or this cadence going forward.')
  if(typeof payload.field!=='string'||payload.field.length>1200||!roots.has(payload.field.split('/')[0])||/(__proto__|prototype|constructor)/.test(payload.field))throw Error('Choose an editable report field.')
  if(payload.reset!==true&&payload.value!==null&&typeof payload.value!=='string'&&!(typeof payload.value==='number'&&Number.isFinite(payload.value)))throw Error('Use text, a finite number or an explicit unknown value.')
  if(typeof payload.value==='string'&&payload.value.length>12000)throw Error('Report text is limited to 12,000 characters per field.')
  const reason=String(payload.reason||'Household report adjustment').trim().slice(0,1000)
  return {packetId:payload.packetId,cadence:payload.cadence,scope:payload.scope,field:payload.field,...(payload.reset===true?{reset:true}:{value:payload.value}),reason}
}
export function applyPacketEdit(state={},payload,{actor='Household member',at=new Date().toISOString()}={}){
  const e=normalizePacketEdit(payload),key=e.scope==='cadence'?e.cadence:e.packetId,edits=clone(state.packetEdits||{})
  const prior=edits[key]||{}
  edits[key]={...prior}
  if(e.reset)delete edits[key][e.field]
  else edits[key][e.field]={value:e.value,reason:e.reason,by:actor,at}
  return {...state,packetEdits:edits}
}

export function effectiveMeetingPacket(source,edits={},narrative=null){
  const packet=clone(source),applied=[],orphaned=[]
  packet.notes=`Prepared automatically for the ${source.label.toLowerCase()} review. ${source.period.from} through ${source.period.to}. Source limitations and proposed actions are included below.`
  for(const key of ['posted','prior','pending'])if(!packet[key])packet[key]={income:null,otherInflows:null,expenses:null,net:null}
  for(const row of packet.creditCards)row.utilization=known(row.balance)&&known(row.limit)&&row.limit>0?row.balance/row.limit:null
  const all={...(edits[source.cadence]||{}),...(edits[packetIdentity(source)]||{})}
  const apply=analysis=>{
    const fields=new Map(editablePacketFields(packet).map(f=>[f.field,f]))
    for(const [path,edit] of Object.entries(all)){
      if(path.startsWith('analysis/')!==analysis)continue
      const f=fields.get(path)
      if(!f){orphaned.push(path);continue}
      if(f.type==='number'&&edit.value!==null&&!known(edit.value)||f.type==='text'&&typeof edit.value!=='string'){orphaned.push(path);continue}
      f.parent[f.key]=edit.value;applied.push({field:path,sourceValue:f.value,...edit})
    }
  }
  apply(false)
  // Component-level adjustments update dependent totals unless a total itself
  // has been explicitly overridden. A total override is visibly independent.
  for(const prefix of ['posted','prior','pending'])if(packet[prefix]&&!Object.hasOwn(all,`${prefix}/net`)){
    const t=packet[prefix];t.net=[t.income,t.otherInflows,t.expenses].every(known)?t.income+t.otherInflows-t.expenses:null
  }
  for(const r of packet.categoryBudget)if(!Object.hasOwn(all,`categoryBudget/${encode(r.category)}/remaining`))r.remaining=known(r.budget)&&known(r.posted)?r.budget-r.posted:null
  for(const r of packet.monthly)if(!Object.hasOwn(all,`monthly/${encode(r.month)}/net`))r.net=[r.income,r.otherInflows,r.expenses].every(known)?r.income+r.otherInflows-r.expenses:null
  for(const r of packet.creditCards)if(!Object.hasOwn(all,`creditCards/${encode(r.id??r.name)}/utilization`))r.utilization=known(r.balance)&&known(r.limit)&&r.limit>0?r.balance/r.limit:null
  packet.analysis={...analyzeMeetingPacket(packet),...(narrative||{})}
  apply(true)
  packet.adjustments=applied;packet.orphanedAdjustments=orphaned
  if(applied.length)packet.status='Draft · Household-adjusted report'
  return packet
}

// Exact, stable input identity. Ignore presentation refresh timestamps.
export function packetAnalysisIdentity(packet){
  const {generatedAt,analysis,adjustments,orphanedAdjustments,...facts}=packet
  return JSON.stringify(facts)
}

export function packetEvidenceIdentity(packet){
  const {generatedAt,analysis,adjustments,orphanedAdjustments,sources,warnings,...facts}=packet
  return JSON.stringify(facts)
}
