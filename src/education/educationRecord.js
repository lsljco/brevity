export const EDUCATION_SCHEMA_VERSION=1
export const ISAIAH_STUDENT_ID='isaiah'
export const MASTERY_STATUSES=['RED','YELLOW','GREEN','BLUE']
export const RESPONSE_RESULTS=['independent','prompted','incorrect','unable']

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value))
const iso=value=>typeof value==='string'&&!Number.isNaN(Date.parse(value))
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))
const bounded=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max

export function emptyIsaiahEducationRecord(){return{schemaVersion:EDUCATION_SCHEMA_VERSION,studentId:ISAIAH_STUDENT_ID,sessions:[],skillMastery:{},standardProgress:{},retrievalSchedule:{},progressChecks:[]}}

export function validateTutorSession(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Tutor session must be an object.')
 if(!bounded(input.id,160)||!date(input.date)||!bounded(input.assessor,80))throw new Error('Tutor session requires id, date, and assessor.')
 if(!Array.isArray(input.responses)||input.responses.length>100)throw new Error('Tutor session responses are invalid.')
 const ids=new Set()
 for(const r of input.responses){
  if(!r||typeof r!=='object'||Array.isArray(r)||!bounded(r.id,160)||ids.has(r.id))throw new Error('Each response requires a unique id.')
  ids.add(r.id)
  if(!bounded(r.activityId,160)||!bounded(r.skillId,160)||!RESPONSE_RESULTS.includes(r.result))throw new Error(`Response ${r.id} is invalid.`)
  if(r.standardCodes!==undefined&&(!Array.isArray(r.standardCodes)||r.standardCodes.length>12||r.standardCodes.some(code=>!bounded(code,80))))throw new Error(`Response ${r.id} has invalid standards.`)
 }
 if(input.fluency){const f=input.fluency;if(!bounded(f.probeId,160)||!Number.isInteger(f.wordsAttempted)||f.wordsAttempted<0||!Number.isInteger(f.errors)||f.errors<0||f.errors>f.wordsAttempted)throw new Error('Fluency evidence is invalid.')}
 return true
}

export function fluencyMetrics(f){if(!f)return null;const correct=Math.max(0,f.wordsAttempted-f.errors);return{...clone(f),wcpm:correct,accuracy:f.wordsAttempted?Number(((correct/f.wordsAttempted)*100).toFixed(1)):0}}

export function masteryFromEvidence(evidence=[],prior='RED'){
 const recent=evidence.slice(-6),independent=recent.filter(e=>e.result==='independent'),encounters=new Set(independent.map(e=>e.sessionId))
 if(recent.some(e=>e.result==='unable')&&!independent.length)return'RED'
 if(independent.some(e=>e.stretch===true)&&encounters.size>=2)return'BLUE'
 if(encounters.size>=2&&independent.length>=3)return'GREEN'
 if(recent.some(e=>['independent','prompted'].includes(e.result)))return'YELLOW'
 return prior==='BLUE'||prior==='GREEN'?'YELLOW':'RED'
}

export function applyCompletedTutorSession(record,input,{now=new Date().toISOString()}={}){
 validateTutorSession(input);if(!iso(now))throw new Error('Completion timestamp is invalid.')
 const current=clone(record||emptyIsaiahEducationRecord())
 if(current.sessions.some(s=>s.id===input.id))throw new Error('This tutor session is already recorded.')
 const session={...clone(input),fluency:fluencyMetrics(input.fluency),completedAt:now}
 const skillMastery={...(current.skillMastery||{})},standardProgress={...(current.standardProgress||{})},retrievalSchedule={...(current.retrievalSchedule||{})}
 for(const r of session.responses){
  const prior=skillMastery[r.skillId]||{status:'RED',evidence:[]}
  const evidence=[...(prior.evidence||[]),{sessionId:session.id,responseId:r.id,result:r.result,stretch:r.stretch===true,at:now}].slice(-24)
  const status=masteryFromEvidence(evidence,prior.status)
  skillMastery[r.skillId]={status,evidence,lastAssessedAt:now}
  retrievalSchedule[r.skillId]=status==='GREEN'||status==='BLUE'?{dueDate:input.nextRetrievalDates?.[r.skillId]||'',reason:'spaced-retrieval'}:{dueDate:input.date,reason:'repair-or-confirm'}
  for(const code of r.standardCodes||[]){const p=standardProgress[code]||{status:'RED',evidence:[]};const se=[...(p.evidence||[]),{sessionId:session.id,responseId:r.id,result:r.result,at:now}].slice(-24);standardProgress[code]={status:masteryFromEvidence(se,p.status),evidence:se,lastAssessedAt:now}}
 }
 return{...current,schemaVersion:EDUCATION_SCHEMA_VERSION,studentId:ISAIAH_STUDENT_ID,sessions:[session,...current.sessions].slice(0,365),skillMastery,standardProgress,retrievalSchedule,updatedAt:now,updatedBy:input.assessor}
}

export function educationSummary(record){const r=record||emptyIsaiahEducationRecord(),counts={RED:0,YELLOW:0,GREEN:0,BLUE:0};Object.values(r.skillMastery||{}).forEach(x=>{if(counts[x.status]!==undefined)counts[x.status]+=1});const latest=r.sessions?.[0]||null;return{sessions:r.sessions?.length||0,masteryCounts:counts,latestFluency:latest?.fluency||null,lastSessionDate:latest?.date||''}}
