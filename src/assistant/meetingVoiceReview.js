// A meeting may review a cohesive batch, but never expands source permissions,
// recurrence scope, financial authority, or strong-confirmation requirements.
const allowed=new Set(['assignment.create','assignment.update','decision.create','decision.update','plan.recap.update','plan.alignment.update','plan.pillar.update','household.schedule.block.create','household.schedule.block.update','household.schedule.occurrence.update','household.maintenance.coverage.update','household.maintenance.completion.update','meal.schedule.update','calendar.create','calendar.update'])
export const meetingApprovalCommand=text=>String(text||'').toLowerCase().trim().replace(/[.!?]+$/,'').replace(/\s+/g,' ')==='apply these changes'
const speakValue=value=>Array.isArray(value)?value.map(speakValue).join('; '):value&&typeof value==='object'?Object.entries(value).map(([k,v])=>`${k.replace(/([A-Z])/g,' $1')}: ${speakValue(v)}`).join('; '):value===null?'none':String(value)
export function meetingVoiceReviewText(proposal,member,now=Date.now()){
 if(!proposal?.id||proposal.actor!==member||proposal.state!=='pending'||proposal.risk!=='confirmation'||!Number.isFinite(Date.parse(proposal.expiresAt))||Date.parse(proposal.expiresAt)<=now||!proposal.operations?.length||proposal.operations.length>8)return ''
 if(proposal.operations.some(op=>!allowed.has(op.type)||op.risk!=='confirmation'||op.defaultScope!=='this-item'||op.allowedScopes?.length!==1||op.allowedScopes[0]!=='this-item'||!op.targetDate||op.payload?.pillar==='finance'))return ''
 const text='Review these proposed changes. '+proposal.operations.map((op,i)=>`${i+1}. ${op.description}. Date: ${op.targetDate}. Record: ${op.voiceTarget?.title||op.targetId||'new item'}. ${speakValue(op.payload)}.`).join(' ')+' Nothing has been saved. Say Apply these changes to approve this exact review, or ask for a correction.'
 return text.length<=5500?text:''
}
export function assertMeetingVoiceApproval({proposal,member,voiceApproval,selections,now=Date.now()}){
 if(!meetingVoiceReviewText(proposal,member,now)||voiceApproval?.proposalId!==proposal.id||!meetingApprovalCommand(voiceApproval?.phrase)||!Number.isFinite(voiceApproval.reviewedAt)||voiceApproval.reviewedAt>now||now-voiceApproval.reviewedAt>120000||proposal.operations.some(op=>selections?.[op.id]&&selections[op.id]!=='this-item'))throw Error('Read the complete current meeting review before approving these changes by voice.')
}
