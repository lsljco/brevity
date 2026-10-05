import {validPracticeDate,validPracticeTime,shiftPracticeDate} from '../household/operatingPractices.js'
import {normalizeHouseholdScheduleState,scheduleForMember} from '../household/householdScheduleData.js'
export const ADULTS=['Larry','Lorenzo','Terica','Nyla','Javin']
export const MEMBERS=[...ADULTS,'Isaiah']
export const GOVERNANCE_TYPES=['orchestration.policy.update','orchestration.policy.approve','orchestration.coordination.update','orchestration.preferences.update','orchestration.recovery.update']
export const preferenceResource=member=>`shared:brevity_orchestration_preferences_${member}_v1`
const text=(v,max=1000)=>{if(typeof v!=='string'||v.length>max)throw Error(`Enter text of at most ${max} characters.`);return v.trim()}
const only=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw Error('Unsupported governance fields.');return v}
const integer=(v,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)throw Error(`Choose a whole number from ${min} to ${max}.`);return v}
const date=v=>{if(!validPracticeDate(v))throw Error('Choose a valid date.');return v}
const members=v=>{if(!Array.isArray(v)||v.length>6||v.some(m=>!MEMBERS.includes(m)))throw Error('Choose known household members.');return [...new Set(v)]}
export const defaultPreferences=()=>({learning:false,style:'checklist',startTime:'08:00',endTime:'20:00',capacityMinutes:null,retentionDays:28,supportStrategy:''})
export function normalizeGovernancePayload(type,p){
 only(p,type==='orchestration.policy.update'?['effectiveDate','reviewDate','expiresOn','supportMembers','decisionMaker','promptMinutes','threshold','recurrenceWindow','workerEnabled']:type==='orchestration.policy.approve'?['revision']:type==='orchestration.preferences.update'?['learning','style','startTime','endTime','capacityMinutes','retentionDays','supportStrategy']:type==='orchestration.recovery.update'?['intent','title','reason','startsOn','endsOn','essential','routineIds','scheduleVersion']:['event','recipient','requestId','note','factors','dependencyId','sourceVersions'])
 if(type==='orchestration.policy.update'){
  if(!ADULTS.includes(p.decisionMaker))throw Error('Choose an explicit leadership decision-maker. No fallback is assigned.')
  date(p.effectiveDate);date(p.reviewDate);if(p.reviewDate<p.effectiveDate)throw Error('Policy review must follow its effective date.')
  if(p.expiresOn){date(p.expiresOn);if(p.expiresOn<p.reviewDate)throw Error('Authorization must not expire before the review reminder.')}
  if(typeof p.workerEnabled!=='boolean')throw Error('Choose whether to enable in-app follow-up.')
  return {...p,supportMembers:members(p.supportMembers).filter(m=>ADULTS.includes(m)),promptMinutes:integer(p.promptMinutes,60,1440),threshold:integer(p.threshold,1,256),recurrenceWindow:integer(p.recurrenceWindow,7,90)}
 }
 if(type==='orchestration.policy.approve')return {revision:integer(p.revision,1,100000)}
 if(type==='orchestration.preferences.update'){
  if(typeof p.learning!=='boolean'||!['checklist','options','prepared-draft'].includes(p.style)||!validPracticeTime(p.startTime)||!validPracticeTime(p.endTime)||p.endTime<=p.startTime)throw Error('Choose valid consent, assistance style and a same-day prompting window.')
  return {...p,capacityMinutes:p.capacityMinutes===null?null:integer(p.capacityMinutes,0,1440),retentionDays:integer(p.retentionDays,7,90),supportStrategy:text(p.supportStrategy,500)}
 }
 if(type==='orchestration.recovery.update'){
  if(!['propose','activate','end'].includes(p.intent))throw Error('Choose a recovery action.')
  if(p.intent!=='propose'){if(Object.keys(p).some(k=>k!=='intent'))throw Error('Activation and closure use the saved recovery plan.');return {intent:p.intent}}
  date(p.startsOn);date(p.endsOn);if(p.endsOn<p.startsOn||p.endsOn>shiftPracticeDate(p.startsOn,6))throw Error('Recovery overrides may cover at most seven days per review.')
  if(!Array.isArray(p.routineIds)||p.routineIds.length>2||p.routineIds.some(x=>typeof x!=='string'||!x||x.length>160))throw Error('Choose up to two nonessential routines.')
  const title=text(p.title,160),reason=text(p.reason,1000),essential=text(p.essential,1000)
  if(!title||!reason||!essential)throw Error('Describe the disruption and essential outcomes to protect.')
  return {...p,title,reason,essential,routineIds:[...new Set(p.routineIds)],scheduleVersion:integer(p.scheduleVersion,0,Number.MAX_SAFE_INTEGER)}
 }
 if(!['request-support','accept-support','decline-support','assess','escalate','decision','learn','dependency','remove-dependency','owner-intervention','support-exhausted','resolve','reopen','withdraw-support'].includes(p.event))throw Error('Unsupported coordination event.')
 const result={event:p.event,note:text(p.note||'',1000),sourceVersions:p.sourceVersions}
 if(p.event==='request-support'){if(!ADULTS.includes(p.recipient))throw Error('Choose an approved adult support member.');result.recipient=p.recipient}
 if(['accept-support','decline-support','withdraw-support'].includes(p.event)){result.requestId=text(p.requestId,160);if(!result.requestId)throw Error('Choose an exact support request.')}
 if(p.event==='assess'){
  only(p.factors,['urgency','impact','recurrence','crossPillarEffect']);result.factors={}
  for(const k of ['urgency','impact','recurrence','crossPillarEffect']){only(p.factors[k],['value','evidence']);const evidence=text(p.factors[k].evidence,500);if(!evidence)throw Error('Explain every consequence factor.');result.factors[k]={value:integer(p.factors[k].value,1,4),evidence}}
 }
 if(['dependency','remove-dependency'].includes(p.event)){result.dependencyId=text(p.dependencyId,300);if(!result.dependencyId)throw Error('Choose an exact dependency.')}
 if(['decision','learn','escalate','owner-intervention','support-exhausted','resolve','reopen','withdraw-support'].includes(p.event)&&!result.note)throw Error('Record the decision, observed strategy, or escalation reason.')
 return result
}
export function policyActive(policy,today){return Boolean(policy?.approvedBy==='Lorenzo'&&policy.approvedRevision===policy.revision&&policy.effectiveDate<=today&&(policy.expiresOn||policy.reviewDate)>=today)}
export function activeDependencies(events=[]){
 const active=new Map()
 for(const event of events){if(event.event==='dependency')active.set(event.dependencyId,{id:event.dependencyId,title:event.dependencyTitle});if(event.event==='remove-dependency')active.delete(event.dependencyId)}
 return [...active.values()]
}
export function caseResolved(events=[]){return [...events].reverse().find(e=>['resolve','reopen','decision'].includes(e.event))?.event!=='reopen'&&events.some(e=>['resolve','decision'].includes(e.event))}
export function escalationReadiness(item,policy,now=new Date()){
 const history=item.events||[],events=history.slice(history.findLastIndex(e=>e.event==='reopen')+1)
 if(caseResolved(events)||['completed','verified'].includes(item.state))return {allowed:false,reason:'This case is resolved.'}
 if(!item.risk?.complete)return {allowed:false,reason:'Record the evidenced consequence assessment before escalation.'}
 if(item.risk.factors.urgency.value===4)return {allowed:true,reason:'Evidenced immediate consequence requires leadership judgment.'}
 const prepare=events.find(e=>e.event==='prepare')
 if(!prepare)return {allowed:false,reason:'Prepare useful assistance before routine escalation.'}
 const intervention=[...events].reverse().find(e=>e.event==='owner-intervention'&&Date.parse(e.at)>=Date.parse(prepare.at))
 if(!intervention)return {allowed:false,reason:'Record the owner intervention and allow time for the owner to act.'}
 const wait=(policy?.promptMinutes||240)*60000
 if(!Number.isFinite(Date.parse(intervention.at))||now.getTime()-Date.parse(intervention.at)<wait)return {allowed:false,reason:'The owner response window is still open.'}
 const exhausted=[...events].reverse().find(e=>e.event==='support-exhausted'&&Date.parse(e.at)>=Date.parse(intervention.at)+wait)
 if(!exhausted)return {allowed:false,reason:'Review approved support and established coverage, and record why assistance remains insufficient.'}
 if(supportRequests({events}).some(r=>r.response==='pending'))return {allowed:false,reason:'An approved support request still needs an answer or reviewed withdrawal.'}
 return {allowed:true,reason:'Preparation, owner opportunity, and support/coverage review are recorded.'}
}
export function eligibleException(item,policy,now=new Date()){
 return Boolean(policy?.workerEnabled&&item.risk?.complete&&item.risk.score>=policy.threshold&&escalationReadiness(item,policy,now).allowed)
}
export const recoveryExitOperations=(plan,today,schedule,scheduleVersion)=>(plan.operations||[]).filter(op=>op.targetDate>=today&&(!schedule||plan.activatedOverrides||scheduleVersion===undefined||scheduleVersion===plan.activatedScheduleVersion)&&(!schedule||!plan.activatedOverrides||JSON.stringify(schedule.routineOverrides?.[`${op.targetId}:${op.targetDate}`])===JSON.stringify(plan.activatedOverrides[`${op.targetId}:${op.targetDate}`]))&&(!schedule||schedule.routines?.some(r=>r.id===op.targetId))).map(op=>({...op,payload:{date:op.targetDate,cancelled:false},description:`End Recovery Mode: restore the dated routine on ${op.targetDate}. Standing ownership is unchanged.`}))
export function supportRequests(entry){
 const events=entry?.events||[]
 return events.filter(e=>e.event==='request-support').map(e=>({...e,response:[...events].reverse().find(r=>r.requestId===e.id&&['accept-support','decline-support','withdraw-support'].includes(r.event))?.event||'pending'}))
}
export function sharedCaseMember(entry,member){return supportRequests(entry).some(r=>r.recipient===member&&!['decline-support','withdraw-support'].includes(r.response))||(entry?.events||[]).some(e=>e.event==='escalate'&&e.recipient===member)}
export function governancePermission({operation,member,role,permissions}){
 if(!GOVERNANCE_TYPES.includes(operation.type))return null
 if(operation.type==='orchestration.preferences.update')return operation.targetId===member&&permissions?.planning?{allowed:true}:{allowed:false,reason:'Members may review only their own assistance preferences with planning access.'}
 if(operation.type==='orchestration.policy.approve')return member==='Lorenzo'&&permissions?.planning?{allowed:true}:{allowed:false,reason:'GOV-001 ratification requires Lorenzo’s signed-in review and planning access.'}
 if(['orchestration.policy.update','orchestration.recovery.update'].includes(operation.type))return role==='admin'?{allowed:true}:{allowed:false,reason:'Policy configuration and household recovery require administrator review.'}
 return role==='admin'||permissions?.planning?{allowed:true}:{allowed:false,reason:'Coordination requires planning access.'}
}
export function applyGovernance(value,operation,{actor,now,createId,governanceContext}={}){
 const prior=value||{schemaVersion:1,cases:{},paused:false},p=operation.payload,stamp=now().toISOString()
 if(operation.type==='orchestration.preferences.update')return {...p,member:actor,updatedAt:stamp}
 if(operation.type==='orchestration.policy.update')return {...prior,policy:{...p,revision:(prior.policy?.revision||0)+1,policyVersion:1,proposedBy:actor,proposedAt:stamp,approvedBy:null,approvedRevision:null}}
 if(operation.type==='orchestration.policy.approve'){
  if(prior.policy?.revision!==p.revision)throw Error('The policy changed. Review the current revision.')
  return {...prior,policy:{...prior.policy,approvedBy:actor,approvedAt:stamp,approvedRevision:p.revision}}
 }
 if(operation.type==='orchestration.recovery.update'){
  const id=operation.targetId,existing=prior.recovery?.[id]
  if(p.intent==='propose')return {...prior,recovery:{...prior.recovery,[id]:{...p,id,status:'proposed',createdBy:actor,createdAt:stamp,operations:governanceContext?.recoveryOperations||[]}}}
  if(!existing)throw Error('The recovery plan no longer exists.')
  return {...prior,recovery:{...prior.recovery,[id]:{...existing,status:p.intent==='activate'?'active':'ended',...(p.intent==='activate'?{activatedScheduleVersion:existing.scheduleVersion+(existing.operations.length?1:0)}:{}),updatedBy:actor,updatedAt:stamp}}}
 }
 if(!governanceContext?.case)throw Error('A current authorized responsibility is required.')
 const id=operation.targetId,entry=prior.cases?.[id]||{id,date:operation.targetDate,events:[]}
 const event={...p,id:createId(),actor,at:stamp,policyId:'GOV-001',policyVersion:1,...(p.event==='escalate'?{recipient:prior.policy.decisionMaker,exception:governanceContext.case.exception}:{}),...(p.event==='dependency'?{dependencyTitle:governanceContext.dependency?.title}: {})}
 return {...prior,cases:{...prior.cases,[id]:{...entry,events:[...entry.events,event]}}}
}
export function scheduleConflicts(schedule,date,member,isAdmin){
 const state=normalizeHouseholdScheduleState(schedule||{}),conflicts=[],seen=new Set()
 for(const person of isAdmin?MEMBERS:[member]){
  const records=scheduleForMember(state,date,person).filter(x=>validPracticeTime(x.startTime)&&validPracticeTime(x.endTime))
  for(let i=0;i<records.length;i++)for(let j=i+1;j<records.length;j++){
   const a=records[i],b=records[j]
   if(a.startTime>=b.endTime||b.startTime>=a.endTime||a.id===b.id)continue
   const id=[date,person,...[a.id,b.id].sort()].join(':');if(seen.has(id))continue;seen.add(id)
   conflicts.push({id,member:person,left:{id:a.id,title:a.title,pillar:a.pillar},right:{id:b.id,title:b.title,pillar:b.pillar},start:a.startTime>b.startTime?a.startTime:b.startTime,end:a.endTime<b.endTime?a.endTime:b.endTime,crossPillar:Boolean(a.pillar&&b.pillar&&a.pillar!==b.pillar),options:['Protect the fixed commitment and review a new time for the flexible routine.','Request accepted support without transferring ownership.','Ask the designated decision-maker to prioritize if both are essential.']})
  }
 }
 return conflicts
}
export function adaptationSummary(cases,member,preferences,now=new Date(),observations=[]){
 if(!preferences?.learning)return {enabled:false,notice:'Adaptive observations are off. Your stated preferences can still guide preparation.'}
 const since=now.getTime()-preferences.retentionDays*86400000
 const relevant=cases.filter(c=>c.owners.includes(member)),events=relevant.flatMap(c=>c.events||[]).filter(e=>e.actor===member&&Date.parse(e.at)>=since&&Date.parse(e.at)<=now.getTime())
 const strategies=events.filter(e=>e.event==='learn').map(e=>({at:e.at,note:e.note})).slice(-10)
 const validStates=['unknown','not started','in progress','blocked','missed','completed','verified']
 const eligible=observations.filter(o=>o.member===member&&validStates.includes(o.state)&&Date.parse(o.date||o.id?.match(/\d{4}-\d{2}-\d{2}/)?.[0]||o.at)>=since&&Date.parse(o.date||o.at)<=now.getTime())
 // One latest snapshot per responsibility; repeated polling is not another outcome.
 const unique=new Map()
 for(const [index,o] of eligible.entries()){
  const key=o.caseId||o.id||`legacy-${index}`,previous=unique.get(key)
  if(!previous||Date.parse(o.lastObservedAt||o.at)>=Date.parse(previous.lastObservedAt||previous.at))unique.set(key,o)
 }
 const samples=[...unique.values()],known=samples.filter(o=>o.state!=='unknown'),initiated=known.filter(o=>['in progress','completed','verified'].includes(o.state)),completed=known.filter(o=>['completed','verified'].includes(o.state))
 const responded=o=>Number.isFinite(Date.parse(o.promptedAt))&&Number.isFinite(Date.parse(o.acknowledgedAt))&&Date.parse(o.acknowledgedAt)>=Date.parse(o.promptedAt)&&Date.parse(o.acknowledgedAt)<=now.getTime()
 const response=samples.filter(responded).map(o=>(Date.parse(o.acknowledgedAt)-Date.parse(o.promptedAt))/60000).sort((a,b)=>a-b)
 const median=response.length?(response[Math.floor((response.length-1)/2)]+response[Math.floor(response.length/2)])/2:null
 const metrics={observedInitiation:known.length?{initiated:initiated.length,observed:known.length}:null,observedCompletion:known.length?{completed:completed.length,observed:known.length}:null,responseTime:response.length?{medianMinutes:median,samples:response.length}:null,evidence:known.length<5?'Limited observations; no reliable pattern established.':'Descriptive observations; no causal or character inference.'}
 const promptingMethods=['checklist','options','prepared-draft'].map(style=>{const rows=samples.filter(o=>o.style===style&&responded(o));return {style,responses:rows.length,averageMinutes:rows.length?rows.reduce((sum,o)=>sum+(Date.parse(o.acknowledgedAt)-Date.parse(o.promptedAt))/60000,0)/rows.length:null}})
 return {enabled:true,promptingMethods,windowDays:preferences.retentionDays,observedCases:relevant.length,acknowledgements:events.filter(e=>e.event==='acknowledge').length,retainedPreparations:events.filter(e=>e.event==='prepare').length,strategies,...metrics,notice:'Observed workflow states only, not a personal score. Unknown states are excluded from initiation and completion counts. Response time uses recorded in-app prompts and later acknowledgements; reading a prompt is not assumed.'}
}
export function recoveryOperations(plan,schedule){
 const state=normalizeHouseholdScheduleState(schedule||{}),ops=[]
 for(const id of plan.routineIds){
  const routine=state.routines.find(r=>r.id===id);if(!routine)throw Error('A selected routine no longer exists.')
  for(let day=plan.startsOn;day<=plan.endsOn;day=shiftPracticeDate(day,1)){
   const weekday=new Date(`${day}T12:00:00Z`).getUTCDay()
   if(!routine.enabled||!routine.days?.includes(weekday))continue
   if(state.routineOverrides[`${id}:${day}`]?.cancelled)continue
   ops.push({type:'household.schedule.occurrence.update',targetId:id,targetDate:day,payload:{date:day,cancelled:true},description:`Recovery Mode: defer ${routine.title} on ${day} only. Standing ownership and recurrence remain unchanged.`})
  }
 }
 return ops
}
