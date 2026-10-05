import {GOVERNANCE_TYPES,normalizeGovernancePayload,sharedCaseMember,supportRequests,policyActive,eligibleException,activeDependencies,caseResolved} from './governanceModel.js'
import {dailyPracticeCards, readPracticeDay, mealReadiness, validPracticeDate} from '../household/operatingPractices.js'
import {buildHouseholdMaintenanceWeek, householdOccurrence, normalizeHouseholdMaintenanceState} from '../household/householdMaintenanceData.js'

export const GOVERNANCE_RESOURCE = 'shared:brevity_orchestration_v1'
export const GOV_POLICY = Object.freeze({id:'GOV-001',version:1,title:'Human Ownership, AI Delegation & Household Orchestration',status:'Governed assistance, coordination and recovery — activation requires recorded approval',principles:[
  'Ownership does not equal dependency. Preserve the owner’s decision authority while preparing useful work.',
  'AI closes execution gaps. Identify what Brevity can safely accomplish before asking another person.',
  'Orchestrate before escalating. Attempt authorized assistance without delaying consequential decisions.',
  'Bypass the bottleneck, not the person. Coverage requires agreement and does not silently transfer ownership.',
  'Escalate according to consequence: urgency, impact, recurrence and cross-pillar effects.',
  'Lorenzo is not the default fallback. Leadership receives decisions, not automatic work assignments.',
  'Learn execution patterns, not character, motives, spiritual maturity or personal worth.',
],authority:[['L0','Observe'],['L1','Prompt'],['L2','Prepare'],['L3','Coordinate'],['L4','Execute'],['L5','Escalate'],['L6','Restricted']],restrictions:'Existing permissions, Action Mode, verification, audit and Undo remain required. Source changes require reviewed actions. Restricted financial actions and sensitive external communications remain outside delegated authority.'})
export const RESPONSIBILITY_STATES = ['unknown','not started','in progress','blocked','missed','completed','verified']
export const CASE_EVENTS = ['acknowledge','prepare','pause','resume','snooze']
export function consequenceAssessment(factors={}) {
  const names=['urgency','impact','recurrence','crossPillarEffect']
  const complete=names.every(name=>Number.isInteger(factors[name]?.value)&&factors[name].value>=1&&factors[name].value<=4&&typeof factors[name].evidence==='string'&&factors[name].evidence.trim())
  return {factors,score:complete?names.reduce((score,name)=>score*factors[name].value,1):null,complete,mode:'evidence',automaticEscalation:false}
}
export function orchestrationAuthority({level,permitted=false,reviewed=false,ratified=false,restrictedAuthorization=false}={}) {
  if(!permitted)return {allowed:false,reason:'Existing record permissions are required.'}
  if(['L0','L2'].includes(level))return {allowed:true,reason:'Read or prepare only within source visibility.'}
  if(['L1','L3','L5'].includes(level))return {allowed:ratified,reason:'Current ratification and explicit channel, recipient and consequence rules are required.'}
  if(level==='L4')return {allowed:reviewed,reason:'Only supported reversible actions with current Action Mode review, audit and Undo.'}
  if(level==='L6')return {allowed:reviewed&&restrictedAuthorization,reason:'Explicit human authorization and a separately supported operation are required. This layer grants no restricted operations.'}
  return {allowed:false,reason:'Unknown authority level.'}
}
export const phaseOneAuthority=orchestrationAuthority
const explicitState = item => {
  if(item.approvedAt||item.status==='verified'||item.status==='approved')return 'verified'
  if((item.submittedAt&&!item.returnedAt)||item.completedAt||item.status==='complete'||item.status==='completed'||item.complete===true)return 'completed'
  if(item.status==='blocked'||item.exception||item.returnedAt)return 'blocked'
  if(item.status==='missed')return 'missed'
  if(['started','in-progress','in progress','preparing'].includes(item.status)||item.startedAt)return 'in progress'
  if(item.status==='not started')return 'not started'
  return 'unknown'
}
const caseId=(kind,date,id)=>`${kind}:${date}:${encodeURIComponent(id)}`
const blockedOptions=['Clarify the blocker and owner availability.','Prepare a smaller feasible next step.','Request accepted coverage through the existing workflow.']
function assistance(item) {
  const checklist=item.kind==='meal' ? [
    `Confirm ${item.headcount??'the planned number of'} portions and the ready-by time.`,
    'Check usable inventory before preparing a grocery proposal.',
    'Confirm preparation, serving location and cleanup coverage.',
    ...item.gaps,
  ] : item.steps?.length ? item.steps : ['Confirm the required outcome and completion standard.','Identify the smallest next step and any missing information.','Confirm a realistic time and accepted support if needed.']
  return {title:`Preparation for ${item.title}`,checklist:[...new Set(checklist)],questions:item.state==='unknown'?['What is the current status? Missing tracking does not establish a missed responsibility.']:item.state==='blocked'?['What is preventing progress, and what help would make the next step possible?']:['What preparation would help finish this outcome?'],options:item.state==='blocked'?blockedOptions:['Keep the agreed owner and confirm the next step.','Review timing or accepted coverage in the existing source workflow.'],recommendation:item.owners.length?'Prepare the next step with the existing owner; use the source workflow for reviewed changes.':'Confirm an accountable owner before proposing assignment or coverage.'}
}
export function buildOrchestration({date,policyDate=date,plan,schedule,maintenance,sourceStates={},versions={},saved={},member,isAdmin=false}={}) {
  if(!validPracticeDate(date))throw Error('Choose a valid household date.')
  const candidates=[],observedCases=[],closedCases=[]
  const add=item=>{
    if(!item.sourceId||item.closed)return
    const owners=[...new Set((item.owners||[]).filter(Boolean))]
    const id=caseId(item.kind,date,item.sourceId),retained=saved.cases?.[id]
    const assessment=consequenceAssessment([...(retained?.events||[])].reverse().find(e=>e.event==='assess')?.factors||{})
    const automaticRecipient=policyActive(saved.policy,policyDate)&&saved.policy.decisionMaker===member&&eligibleException({risk:assessment,events:retained?.events||[]},saved.policy)&&!saved.paused
    if(!isAdmin&&!owners.includes(member)&&item.coveredBy!==member&&!sharedCaseMember(retained,member)&&!automaticRecipient)return
    const events=(retained?.events||[]).filter(e=>e.policyId===GOV_POLICY.id)
    const lastControl=[...events].reverse().find(e=>['pause','resume','snooze'].includes(e.event))
    const paused=lastControl?.event==='pause'||lastControl?.event==='snooze'&&Date.parse(lastControl.snoozeUntil)>Date.now()
    const base={...item,id,date,owners,sourceVersions:versions,sourceVersion:versions[item.sourceResource],sourceQuality:sourceStates[item.sourceResource]||'unavailable',state:item.state||'unknown',policyId:GOV_POLICY.id,policyVersion:GOV_POLICY.version}
    base.assistance=assistance(base)
    base.events=events
    base.stage=paused?'paused':events.some(e=>e.event==='prepare')?'ASSIST':events.some(e=>e.event==='acknowledge')?'DIAGNOSE':'DETECT'
    base.requests=supportRequests(retained)
    base.dependencies=activeDependencies(events)
    base.resolved=caseResolved(events)
    base.risk=consequenceAssessment([...events].reverse().find(e=>e.event==='assess')?.factors||{})
    if(events.some(e=>e.event==='escalate'))base.stage='ESCALATE'
    else if(base.requests.length)base.stage='ORCHESTRATE'
    if(events.at(-1)?.event==='learn')base.stage='LEARN'
    if(paused)base.stage='paused'
    base.exception={issue:base.title,owner:owners.join(', ')||'Unresolved — no fallback assigned',requiredOutcome:base.outcome,whatHappened:base.evidence,attempts:events.length?events.map(e=>`${e.at}: ${e.actor} reviewed ${e.event}${e.note?` — ${e.note}`:''}`):['No persisted assistance attempts. A preview is not an executed action.'],risk:base.risk.complete?`Reviewed consequence score: ${base.risk.score}/256. Factors: ${Object.entries(base.risk.factors).map(([k,v])=>`${k} ${v.value}: ${v.evidence}`).join('; ')}`:'Consequence factors require evidence; no severity or escalation is inferred.',options:base.assistance.options,recommendation:base.assistance.recommendation,decision:base.owners.length?'Confirm the next step or request support.':'Confirm accountable ownership.',deadline:base.due||'Not established — confirm an intervention deadline.',recipient:policyActive(saved.policy,policyDate)?saved.policy.decisionMaker:null,routing:policyActive(saved.policy,policyDate)?`Designated decision-maker: ${saved.policy.decisionMaker}. Sharing requires reviewed escalation or explicitly approved in-app follow-up.`:'Leadership routing has not been approved. This is a preview; nothing has been sent.'}
    base.automaticException=policyActive(saved.policy,policyDate)&&eligibleException(base,saved.policy)&&!paused&&!saved.paused
    observedCases.push(base)
    if(!['completed','verified'].includes(base.state)&&!base.resolved)candidates.push(base)
    else {base.stage=base.resolved?'RESOLVED':'LEARN';closedCases.push(base)}
  }
  if(sourceStates[`plan:${date}`]==='available'&&plan){
    for(const item of plan.assignments||[])add({kind:'assignment',sourceId:item.id,sourceResource:`plan:${date}`,title:item.title||'Assignment',owners:[item.owner].filter(x=>x&&x!=='Family'),state:explicitState(item),closed:['deferred','cancelled'].includes(item.status),outcome:item.title||'Confirm the required outcome',evidence:`Saved assignment status: ${item.status||'unrecorded'}.`,due:item.dueAt||'',steps:item.notes?[item.notes]:[],pillar:item.pillar||'household'})
    if(sourceStates['shared:brevity_household_schedule_v1']==='available'){
      for(const card of dailyPracticeCards(schedule||{},plan)){
        if(!card.due||!card.effectivePractice||card.state==='needs-attention')continue
        const p=card.effectivePractice,c=card.checkin?.revision===p.revision&&card.checkin.owner===p.routine.owner?card.checkin:null
        add({kind:'practice',sourceId:p.routine.id,sourceResource:`plan:${date}`,title:card.template.title,owners:[p.routine.owner],state:c?.status==='complete'?'completed':c?.status==='blocked'?'blocked':'unknown',outcome:card.template.outcome,evidence:c?`Reported practice: ${c.status}${c.note?` — ${c.note}`:''}`:'No current check-in. This is not a violation.',due:p.routine.endTime||'',steps:[p.procedure,card.template.steps].filter(Boolean),pillar:card.template.pillar,backup:p.backup})
      }
    }
    const practice=readPracticeDay(plan)
    if(!practice.error)for(const slot of ['breakfast','lunch','dinner']){
      const item=practice.data.meals[slot]||{preparation:'unrecorded'}
      if(item.notRequired)continue
      const readiness=mealReadiness(item.mealName?{name:item.mealName}:null,item)
      add({kind:'meal',sourceId:slot,sourceResource:`plan:${date}`,title:`${slot}: ${item.mealName||'Confirm meal'}`,owners:[item.owner].filter(Boolean),state:item.preparation==='ready'?'completed':item.exception?'blocked':item.preparation==='preparing'?'in progress':'unknown',outcome:`Make the agreed ${slot} available for ${item.headcount??'confirmed'} people.`,evidence:`Preparation reported: ${item.preparation}. Physical readiness and consumption are separate.`,due:item.readyBy||'',headcount:item.headcount,gaps:readiness.gaps,pillar:'health'})
    }
  }
  if(sourceStates['shared:brevity_household_maintenance_v1']==='available'){
    const state=normalizeHouseholdMaintenanceState(maintenance||{})
    for(const task of buildHouseholdMaintenanceWeek(new Date(`${date}T12:00:00Z`),state).flatMap(day=>day.date===date?day.tasks:[])){
      const occurrence=householdOccurrence(state,task)
      add({kind:'chore',sourceId:task.occurrenceId,sourceResource:'shared:brevity_household_maintenance_v1',title:task.title,owners:task.owners.filter(x=>x!=='Everyone'),coveredBy:occurrence.coveredBy,state:explicitState(occurrence),outcome:task.standard||task.title,evidence:`Recorded chore status: ${occurrence.status||'unrecorded'}${occurrence.exception?` — ${occurrence.exception}`:''}.`,due:task.endTime||task.timing||'',steps:task.details||[],pillar:'household'})
    }
  }
  return {date,policy:GOV_POLICY,cases:candidates,closedCases,observedCases,sourceStates,sourceVersions:versions,paused:saved.paused===true,systemHealth:{visibleOpenCases:candidates.length,unknown:candidates.filter(x=>x.state==='unknown').length,blocked:candidates.filter(x=>x.state==='blocked').length,unassigned:candidates.filter(x=>!x.owners.length).length,unavailableSources:Object.values(sourceStates).filter(x=>x!=='available').length,scope:isAdmin?'Household source records':'Your owned or covered responsibilities',notice:'Visible operational indicators, not a household performance score. Missing evidence remains unknown.'}}
}
export function normalizeOrchestrationPayload(type,input) {
  if(GOVERNANCE_TYPES.includes(type)){
    const normalized=normalizeGovernancePayload(type,input)
    if(type==='orchestration.coordination.update')normalizeOrchestrationPayload('orchestration.case.update',{event:'prepare',note:normalized.note,sourceVersions:normalized.sourceVersions})
    return normalized
  }
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid orchestration record.')
  if(type==='orchestration.pause.update'){
    if(Object.keys(input).some(k=>k!=='paused')||typeof input.paused!=='boolean')throw Error('Pause requires an explicit boolean.')
    return {paused:input.paused}
  }
  if(Object.keys(input).some(k=>!['event','note','sourceVersions','snoozeUntil'].includes(k))||!CASE_EVENTS.includes(input.event))throw Error('Choose a supported reviewed case event.')
  if(typeof input.note!=='string'||input.note.length>1000)throw Error('Case notes must be text of at most 1,000 characters.')
  if(!input.sourceVersions||typeof input.sourceVersions!=='object'||Array.isArray(input.sourceVersions)||Object.keys(input.sourceVersions).length!==3||Object.entries(input.sourceVersions).some(([k,v])=>!(/^(plan:\d{4}-\d{2}-\d{2}|shared:brevity_household_(schedule|maintenance)_v1)$/.test(k))||!Number.isInteger(v)||v<0))throw Error('Refresh the exact source versions before review.')
  if(input.event==='snooze'&&(!Number.isFinite(Date.parse(input.snoozeUntil))||Date.parse(input.snoozeUntil)<=Date.now()||Date.parse(input.snoozeUntil)>Date.now()+7*86400000))throw Error('Choose a future snooze within seven days.')
  if(input.event!=='snooze'&&input.snoozeUntil!==undefined)throw Error('Only snooze may include a snooze deadline.')
  return {event:input.event,note:input.note.trim(),sourceVersions:input.sourceVersions,...(input.event==='snooze'?{snoozeUntil:input.snoozeUntil}:{})}
}
export function applyOrchestration(value,operation,{actor,now,createId,orchestrationCase}) {
  const prior=value||{schemaVersion:1,cases:{},paused:false}
  if(operation.type==='orchestration.pause.update')return {...prior,paused:operation.payload.paused}
  if(!orchestrationCase||orchestrationCase.id!==operation.targetId)throw Error('A verified source case is required.')
  const id=operation.targetId,entry=prior.cases?.[id]||{id,date:operation.targetDate,events:[]}
  const event={id:createId(),at:now().toISOString(),actor,event:operation.payload.event,...(operation.payload.event==='snooze'?{snoozeUntil:operation.payload.snoozeUntil}:{}),note:operation.payload.note,sourceVersions:operation.payload.sourceVersions,policyId:GOV_POLICY.id,policyVersion:GOV_POLICY.version,...(operation.payload.event==='prepare'?{preparation:orchestrationCase.assistance}:{})}
  return {...prior,cases:{...prior.cases,[id]:{...entry,events:[...entry.events,event]}}}
}
