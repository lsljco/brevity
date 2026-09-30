import {getStore} from './scoped-store.mjs'
import {householdDate} from './assistant-authoritative-context.mjs'
export const HEALTH_MEMBERS=['Larry','Lorenzo','Terica','Nyla','Javin','Isaiah']
export const HEALTH_ZONE='America/New_York'
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})}
const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))fail('Unsupported health request fields.')}
const bool=value=>{if(typeof value!=='boolean')fail('Health choices must be true or false.');return value}
const uuid=value=>{if(typeof value!=='string'||!/^[a-f0-9-]{36}$/i.test(value))fail('A valid device identifier is required.');return value}
const dateValid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value
export const emptyHealth=()=>({version:0,consentRevision:0,connection:null,days:[],audit:[]})
export function healthSettings(value,payload,now=new Date()){
 exact(payload,['expectedVersion','deviceId','enabled','steps','workouts','assistantAccess','shareSteps','shareWorkouts','stepGoal','confirmed'])
 if(payload.confirmed!==true)fail('Review and confirm these health privacy choices.')
 if(payload.expectedVersion!==value.version)fail('Health settings changed. Refresh and review again.',409)
 const previous=value.connection||{},deviceId=uuid(payload.deviceId||previous.deviceId)
 if(previous.enabled&&previous.deviceId!==deviceId)fail('Disconnect the current iPhone before connecting another.',409)
 const connection={deviceId,enabled:bool(payload.enabled),steps:bool(payload.steps),workouts:bool(payload.workouts),assistantAccess:bool(payload.assistantAccess),shareSteps:bool(payload.shareSteps),shareWorkouts:bool(payload.shareWorkouts),stepGoal:payload.stepGoal}
 if(!Number.isInteger(connection.stepGoal)||connection.stepGoal<100||connection.stepGoal>100000)fail('Choose a step goal between 100 and 100,000.')
 if(connection.enabled&&!connection.steps&&!connection.workouts)fail('Select steps or workouts to connect.')
 if(!connection.enabled){connection.steps=false;connection.workouts=false;connection.assistantAccess=false;connection.shareSteps=false;connection.shareWorkouts=false}
 if(!connection.steps)connection.shareSteps=false
 if(!connection.workouts)connection.shareWorkouts=false
 const at=now.toISOString()
 // Revocation clears previously synchronized summaries; reconnecting requires fresh explicit consent.
 const days=connection.enabled&&previous.deviceId===deviceId?(value.days||[]).map(day=>({...day,steps:connection.steps?day.steps:null,workoutCount:connection.workouts?day.workoutCount:null,workoutMinutes:connection.workouts?day.workoutMinutes:null})):[]
 return {...value,version:value.version+1,consentRevision:value.consentRevision+1,connection,days,lastSyncAt:connection.enabled?value.lastSyncAt:null,lastCapturedAt:null,audit:[...(value.audit||[]),{at,event:connection.enabled?'privacy-reviewed':'disconnected',choices:connection}].slice(-100)}
}
function metric(value,max,integer=false){if(value===null)return null;if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max||(integer&&!Number.isInteger(value)))fail('A health measurement is invalid.');return value}
export function applyHealthSnapshot(value,payload,now=new Date()){
 exact(payload,['deviceId','consentRevision','capturedAt','timeZone','days'])
 const c=value.connection
 if(!c?.enabled||payload.deviceId!==c.deviceId||payload.consentRevision!==value.consentRevision)fail('This health connection has changed or was disconnected. Review it again.',409)
 if(payload.timeZone!==HEALTH_ZONE)fail('Use the household time zone for daily health summaries.')
 const captured=Date.parse(payload.capturedAt)
 if(!Number.isFinite(captured)||captured>now.getTime()+300000||captured<now.getTime()-86400000)fail('Refresh the health snapshot before syncing.')
 if(value.lastCapturedAt&&captured<=Date.parse(value.lastCapturedAt))return value
 if(!Array.isArray(payload.days)||payload.days.length!==30)fail('Sync a complete 30-day window, including unknown days.')
 const today=householdDate(now,HEALTH_ZONE),oldest=new Date(Date.parse(today)-29*86400000).toISOString().slice(0,10),seen=new Set()
 const days=payload.days.map(day=>{
  exact(day,['date','steps','workoutCount','workoutMinutes'])
  if(!dateValid(day.date)||day.date<oldest||day.date>today||seen.has(day.date))fail('Health dates must cover the current 30-day window exactly once.')
  seen.add(day.date)
  const steps=metric(day.steps,300000,true),workoutCount=metric(day.workoutCount,100,true),workoutMinutes=metric(day.workoutMinutes,1440)
  if((workoutCount===null)!==(workoutMinutes===null))fail('Workout totals must both be known or both be unknown.')
  if(!c.steps&&steps!==null||!c.workouts&&(workoutCount!==null||workoutMinutes!==null))fail('This data type is not authorized.',403)
  return {date:day.date,steps,workoutCount,workoutMinutes}
 }).sort((a,b)=>a.date.localeCompare(b.date))
 return {...value,version:value.version+1,days,lastCapturedAt:new Date(captured).toISOString(),lastSyncAt:now.toISOString()}
}
export function healthSummary(value,member,now=new Date()){
 const c=value.connection,today=householdDate(now,HEALTH_ZONE),days=c?.enabled?value.days||[]:[],current=days.find(day=>day.date===today)||{date:today,steps:null,workoutCount:null,workoutMinutes:null}
 return {member,version:value.version,consentRevision:value.consentRevision,connection:c,timeZone:HEALTH_ZONE,source:'Apple Health via Brevity iPhone',today:current,days,lastSyncAt:value.lastSyncAt||null,lastCapturedAt:value.lastCapturedAt||null,stale:!value.lastSyncAt||now-Date.parse(value.lastSyncAt)>6*3600000,audit:value.audit||[]}
}
export function sharedHealthSummary(value,member,now=new Date()){
 const c=value.connection
 if(!c?.enabled||!c.shareSteps&&!c.shareWorkouts)return null
 const own=healthSummary(value,member,now)
 return {member,source:own.source,lastSyncAt:own.lastSyncAt,stale:own.stale,date:own.today.date,...(c.shareSteps?{steps:own.today.steps,stepGoal:c.stepGoal}:{}),...(c.shareWorkouts?{workoutCount:own.today.workoutCount,workoutMinutes:own.today.workoutMinutes}:{})}
}
export function productionHealthRepository(){
 const store=getStore({name:'brevity-member-health',consistency:'strong'}),prefix=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
 const key=member=>{if(!HEALTH_MEMBERS.includes(member))fail('Unknown household member.',403);return `${prefix}/${member}`}
 return {
  async read(member){const entry=await store.getWithMetadata(key(member),{type:'json'});return {value:entry?.data||emptyHealth(),etag:entry?.etag||null}},
  async write(member,value,etag){const result=await store.setJSON(key(member),value,etag?{onlyIfMatch:etag}:{onlyIfNew:true});if(result?.modified===false)fail('Health data changed while saving. Refresh and retry.',409)},
 }
}
export async function assistantHealthContext(member,repository=productionHealthRepository(),now=new Date()){
 const {value}=await repository.read(member)
 if(!value.connection?.enabled||!value.connection.assistantAccess)return {state:'not-authorized',member}
 const {connection,audit,...summary}=healthSummary(value,member,now)
 return {...summary,state:'available',stepGoal:connection.stepGoal,notice:'Read-only Apple Health summaries. Unknown is not zero. Sync may be delayed. Never diagnose or change permissions from conversation.'}
}
