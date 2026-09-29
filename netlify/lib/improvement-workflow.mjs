export const IMPROVEMENT_RESOURCE='shared:brevity_improvement_proposals_v1'
const proposalFields=['title','problem','evidence','solution','benefit','risks','successMetric']
const planningFields=['requirements','userStories','dataChanges','permissionChanges','testPlan','rolloutPlan','rollbackPlan']
const transitionFields=['stage','notes','previewUrl','commitSha','evaluationSummary',...planningFields]
const transitions={proposed:['concept-approved','rejected'],'concept-approved':['implementation-planned','prototype-ready','revision-requested'],'implementation-planned':['prototype-ready','revision-requested'],'prototype-ready':['release-approved','revision-requested'],'release-approved':['measured','rollback-requested'],measured:['revision-requested','rollback-requested'],'revision-requested':['prototype-ready','rejected'],'rollback-requested':['prototype-ready','rejected']}
export function normalizeImprovementPayload(type,payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Improvement details must be an object.')
 const fields=type==='improvement.propose'?proposalFields:transitionFields,result={}
 for(const [field,value] of Object.entries(payload)){
  if(!fields.includes(field)||typeof value!=='string'||value.length>3000)throw Error(`Invalid improvement field: ${field}.`)
  result[field]=value.trim()
 }
 if(type==='improvement.propose'&&proposalFields.some(field=>!result[field]))throw Error('An improvement requires title, problem, evidence, solution, benefit, risks and successMetric. Distinguish reported evidence from verified measurements.')
 if(type==='improvement.transition'){
  if(!result.stage||!Object.values(transitions).flat().includes(result.stage)||!result.notes)throw Error('An improvement transition requires a recognized stage and review notes.')
  if(result.stage==='implementation-planned'&&planningFields.some(field=>!result[field]))throw Error('An implementation plan needs requirements, user stories, data and permission changes, test plan, rollout and rollback plans.')
  if(result.stage!=='implementation-planned'&&planningFields.some(field=>field in result))throw Error('Implementation details require an implementation-planned review.')
  if(result.stage!=='prototype-ready'&&['previewUrl','commitSha','evaluationSummary'].some(key=>key in result))throw Error('Prototype evidence can change only in a prototype-ready review.')
  if(result.stage==='prototype-ready'){
   if(!/^https:\/\//.test(result.previewUrl||'')||!/^[a-f0-9]{40}$/.test(result.commitSha||'')||!result.evaluationSummary)throw Error('A prototype requires its HTTPS previewUrl, exact commitSha and evaluationSummary.')
   const url=new URL(result.previewUrl);if(url.username||url.password)throw Error('Do not store credentials in prototype evidence URLs.')
  }
 }
 return result
}
export function improvementPermission({operation,member,role,permissions,currentRecord}){
 if(role!=='admin'&&!permissions?.planning)return{allowed:false,reason:'Improvement proposals require planning access.'}
 if(operation.type==='improvement.propose')return{allowed:true}
 if(!currentRecord)return{allowed:false,reason:'Find the exact saved improvement proposal first.'}
 return ['Larry','Lorenzo'].includes(member)?{allowed:true}:{allowed:false,reason:'Only Larry or Lorenzo can approve or advance an improvement proposal.'}
}
export function applyImprovement(value,operation,{actor,now,createId}){
 const records=Array.isArray(value)?structuredClone(value):[],payload=normalizeImprovementPayload(operation.type,operation.payload),at=now().toISOString()
 if(operation.type==='improvement.propose'){
  if(records.length>=250)throw Error('The improvement register is full. Review existing proposals before adding more.')
  return [...records,{id:createId(),...payload,stage:'proposed',createdBy:actor,createdAt:at,history:[{stage:'proposed',actor,at,notes:'Prepared for concept review.'}]}]
 }
 const index=records.findIndex(item=>item.id===operation.targetId)
 if(index<0)throw Error('The saved improvement proposal no longer exists.')
 const current=records[index]
 if(!transitions[current.stage]?.includes(payload.stage))throw Error(`Cannot move an improvement from ${current.stage} to ${payload.stage}. Complete the preceding review first.`)
 if(payload.stage==='release-approved'&&(!current.previewUrl||!current.commitSha||!current.evaluationSummary))throw Error('Release approval requires retained prototype and evaluation evidence.')
 records[index]={...current,...payload,updatedBy:actor,updatedAt:at,history:[...(current.history||[]),{stage:payload.stage,actor,at,notes:payload.notes}]}
 return records
}
