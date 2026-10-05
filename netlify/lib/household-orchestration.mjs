import {buildOrchestration,GOVERNANCE_RESOURCE,GOV_POLICY} from '../../src/governance/orchestration.js'
import {validPracticeDate} from '../../src/household/operatingPractices.js'
export const phaseOneEnabled=()=>process.env.BREVITY_GOV001_PHASE1_ENABLED==='true'
export async function loadOrchestration({resources,session,date,enabled=phaseOneEnabled()}) {
  if(!enabled)return {enabled:false,policy:GOV_POLICY,notice:'GOV-001 Phase 1 is awaiting pilot activation. Existing household workflows remain available.'}
  if(!validPracticeDate(date))throw Error('Choose a valid household date.')
  const keys=[`plan:${date}`,'shared:brevity_household_schedule_v1','shared:brevity_household_maintenance_v1',GOVERNANCE_RESOURCE]
  const results=await Promise.allSettled(keys.map(key=>resources.read(key)))
  const sourceStates={},versions={},values={}
  results.forEach((result,i)=>{
    const key=keys[i],record=result.status==='fulfilled'?result.value:null
    const valid=record&&Number.isInteger(record.version)&&record.version>=0
    sourceStates[key]=valid&&!record.missing&&record.value!=null?'available':'unavailable'
    if(valid){versions[key]=record.version;values[key]=record.value}
  })
  // No initialization during GET. Missing governance is an empty preview, not an error.
  const model=buildOrchestration({date,plan:values[keys[0]],schedule:values[keys[1]],maintenance:values[keys[2]],saved:values[GOVERNANCE_RESOURCE]||{},sourceStates:Object.fromEntries(keys.slice(0,3).map(k=>[k,sourceStates[k]])),versions:Object.fromEntries(keys.slice(0,3).filter(k=>versions[k]!=null).map(k=>[k,versions[k]])),member:session.member,isAdmin:session.role==='admin'})
  return {...model,enabled:true,isAdmin:session.role==='admin',version:versions[GOVERNANCE_RESOURCE]??null,caseStoreAvailable:results[3].status==='fulfilled',canReview:session.role==='admin'||session.planning===true}
}
export async function validateOrchestrationCase({operation,resources,session}) {
  const model=await loadOrchestration({resources,session,date:operation.targetDate})
  if(model.paused)throw Error('Household assistance is paused. Resume it before recording assistance.')
  const keys=Object.keys(model.sourceVersions)
  if(keys.length!==3||keys.some(key=>operation.payload.sourceVersions[key]!==model.sourceVersions[key]))throw Object.assign(Error('The responsibility sources changed. Refresh and prepare a new review.'),{code:'VERSION_CONFLICT'})
  const item=model.cases.find(x=>x.id===operation.targetId)
  if(!item)throw Object.assign(Error('This responsibility is unavailable, completed, or outside your ownership. Refresh the source.'),{code:'FORBIDDEN'})
  if(item.stage==='paused'&&!['resume','pause'].includes(operation.payload.event))throw Error('Resume this case before recording assistance.')
  return item
}
