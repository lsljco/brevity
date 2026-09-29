// Voice confirms an already-normalized, single routine change. It never lets
// the model execute a write or turns a casual yes into authorization.
const routineTypes=new Set(['assignment.create','household.schedule.block.create','assignment.update','household.schedule.block.update','activity.record'])
const names={'assignment.create':'Create a task','household.schedule.block.create':'Create a household work block','activity.record':'Record a reported activity','assignment.update':'Update a task','household.schedule.block.update':'Update a household work block'}
const fieldNames={title:'Title',owner:'Owner',participants:'Participants',date:'Date',startTime:'Start time',endTime:'End time',pillar:'Pillar',notes:'Notes',status:'Status',priority:'Priority',source:'Source'}
const activityKinds=new Set(['workout','progress','maintenance','study-note','sermon-note','ministry-followup','sleep','hydration'])
const activityFields={kind:'Activity type',title:'Title',notes:'Notes',durationMinutes:'Duration in minutes',quantity:'Quantity',unit:'Unit',status:'Status'}
export const VOICE_REVIEW_MAX_AGE_MS=120000
export function voiceApprovalCommand(text){
 const normalized=String(text||'').trim().toLowerCase().replace(/[.!]+$/g,'').trim().replace(/\s+/g,' ')
 return normalized==='apply this change'?'approve':normalized==='cancel this change'?'cancel':null
}
export function voiceReviewText(proposal,member,now=Date.now()){
 if(!proposal?.id||proposal.actor!==member||proposal.state!=='pending'||proposal.risk!=='confirmation'||Date.parse(proposal.expiresAt)<=now||!Number.isFinite(Date.parse(proposal.expiresAt))||proposal.operations?.length!==1)return ''
 const op=proposal.operations[0],payload=op.payload||{}
 if(!routineTypes.has(op.type)||op.risk!=='confirmation'||op.defaultScope!=='this-item'||op.allowedScopes?.length!==1||op.allowedScopes[0]!=='this-item'||!op.targetDate)return ''
 const activity=op.type==='activity.record'
 if(activity&&(op.targetId!==member||!activityKinds.has(payload.kind)))return ''
 const labels=activity?activityFields:fieldNames
 const updating=op.type.endsWith('.update'),target=op.voiceTarget
 if(updating){
  if(!op.targetId||!target?.title||target.id!==op.targetId||!target.resource||!Number.isInteger(target.version)||proposal.expectedVersions?.[target.resource]!==target.version)return ''
 }else if(!payload.title)return ''
 if(!Object.keys(payload).length)return ''
 if(Object.keys(payload).some(key=>!labels[key]))return ''
 const details=Object.entries(payload).map(([key,value])=>`${labels[key]}: ${Array.isArray(value)?value.join(', ')||'none':value===''||value==null?'clear this field':String(value)}.`).join(' ')
 const identity=updating?`Existing item: ${target.title}. ${['owner','date','startTime','endTime','status'].filter(key=>target[key]).map(key=>`${fieldNames[key]}: ${target[key]}.`).join(' ')} Requested changes: `:''
 const text=`Review before applying. ${names[op.type]}. ${activity?`Member: ${member}. This is your report, not independently verified. `:''}Date: ${op.targetDate}. ${identity}${details} Nothing has been saved. After I finish, say Apply this change to save this one item, or Cancel this change.`
 return text.length<=1800?text:''
}
export function assertVoiceApproval({proposal,member,voiceApproval,selections,now=Date.now()}){
 if(!voiceReviewText(proposal,member,now)||voiceApproval?.proposalId!==proposal.id||voiceApprovalCommand(voiceApproval?.phrase)!=='approve'||!Number.isFinite(voiceApproval?.reviewedAt)||voiceApproval.reviewedAt>now||now-voiceApproval.reviewedAt>VOICE_REVIEW_MAX_AGE_MS||proposal.operations.some(op=>selections?.[op.id]&&selections[op.id]!=='this-item'))throw new Error('Read the current routine-item review before approving it by voice. This change may require on-screen confirmation.')
}
