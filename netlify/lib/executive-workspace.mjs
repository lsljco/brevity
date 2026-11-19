import {createHash} from 'node:crypto'
import {getStore} from './scoped-store.mjs'
import {sanitizeAuthoritativeContext} from './assistant-authoritative-context.mjs'
import {EXECUTIVE_ROLES,HANDOFF_STATES,activeExecutive} from '../../src/executives/model.js'
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})}
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${label} is required (maximum ${max} characters).`);return value.trim()}
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,value[key]]))
export function requireExecutiveAdmin(session){if(!session)fail('Sign in to use the executive workspace.',401);if(session.role!=='admin')fail('Administrator access is required.',403)}
export function requireExecutive(role){if(!activeExecutive(role))fail('Choose an active executive role.');return role}
export function executiveContext(role,canonical){
 requireExecutive(role)
 const plan=canonical.dailyPlan||{},records=canonical.actionRecords||{}
 const base={role,generatedAt:canonical.generatedAt,householdDate:canonical.householdDate,sources:(canonical.sources||[]).filter(source=>role==='cto'||(role==='cfo'?source.id==='shared-action-records'||source.id==='daily-plan':role==='bruce'?source.id==='daily-plan'||source.id==='shared-action-records':source.id!=='active-sermon')),notice:'Bounded saved-record snapshot. Generation time is not source freshness. This is not a live bank reconciliation or an Apple Calendar refresh. No source records were changed.'}
 let data
 if(role==='cfo')data={finance:records.finance,dailyFinance:plan.finance,versions:pick(records.versions,['lslj_finance_v9','lslj_budget_v1','brevity_finance_scenarios_v1','lslj_tx_overrides_v1','lslj_tx_rules_v1'])}
 else if(role==='cto')data={sources:canonical.sources,notice:'Technical context contains source availability only. Use separately authorized repository and runtime tools for diagnosis; household records are not included.'}
 else if(role==='bruce')data={outcomes:plan.topPriorities||plan.household?.priorities||[],decisions:plan.decisions,assignments:plan.assignments,projects:records.projects}
 else data={outcomes:plan.topPriorities||plan.household?.priorities||[],householdPlan:plan.household,assignments:plan.assignments,decisions:plan.decisions,projects:records.projects,brevityCalendar:records.familyCalendarEvents,plannedMeals:canonical.rollingMealPlan}
 // Explicit selection prevents unrelated health, education and financial details
 // from leaking through convenience fields or a generic full-context spread.
 return sanitizeAuthoritativeContext({...base,data})
}
export function createExecutiveRepository({store,root='lslj-family/',now=()=>new Date()}){
 const key=id=>{if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))fail('Invalid handoff ID.');return `${root}handoffs/${id}`}
 async function list(role){
  requireExecutive(role)
  const page=await store.list({prefix:root+'handoffs/'})
  const rows=await Promise.all(page.blobs.map(blob=>store.get(blob.key,{type:'json'})))
  return {rows:rows.filter(row=>row&&(role==='bruce'||row.from===role||row.to===role)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),hasMore:Boolean(page.cursor),notice:page.cursor?'Only the first storage page is shown. Known handoffs remain accessible by ID.':'Shared handoffs; completion is reported, not independently verified.'}
 }
 async function get(id,role){requireExecutive(role);const row=await store.get(key(id),{type:'json'});if(!row)fail('Handoff not found.',404);if(role!=='bruce'&&row.from!==role&&row.to!==role)fail('This handoff is outside the selected role.',403);return row}
 async function create(input,session){
  requireExecutiveAdmin(session);requireExecutive(input.role);requireExecutive(input.to)
  const id=text(input.id,100,'Handoff ID'),recordKey=key(id)
  if(input.role===input.to)fail('Choose a different receiving role.')
  const title=text(input.title,180,'Outcome'),sourceRef=text(input.sourceRef,500,'Source reference'),sourceAsOf=text(input.sourceAsOf,80,'Source date or explicit unknown'),note=text(input.note,2000,'Requested work')
  const due=input.due||'';if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due+'T12:00:00Z'))||new Date(due+'T12:00:00Z').toISOString().slice(0,10)!==due))fail('Use a valid due date.')
  const content={id,from:input.role,to:input.to,title,sourceRef,sourceAsOf,note,due,createdBy:session.member}
  const requestHash=createHash('sha256').update(JSON.stringify(content)).digest('hex')
  const at=now().toISOString(),row={...content,requestHash,status:'queued',version:1,createdAt:at,updatedAt:at,authority:'Prepare only. Source changes require their existing authorization and Action Mode workflow.',history:[{at,actor:session.member,role:input.role,status:'queued',note}]}
  const result=await store.setJSON(recordKey,row,{onlyIfNew:true})
  if(result?.modified===false){const existing=await get(id,input.role);if(existing.requestHash!==requestHash)fail('This handoff ID was used for different work.',409);return {row:existing,replayed:true}}
  return {row}
 }
 async function change(input,session){
  requireExecutiveAdmin(session);requireExecutive(input.role)
  const entry=await store.getWithMetadata(key(input.id),{type:'json'}),prior=entry?.data
  if(!prior)fail('Handoff not found.',404)
  const target=input.status
  if(!HANDOFF_STATES.includes(target)||target==='queued')fail('Choose a supported next status.')
  if(input.role!==prior.to&&!(target==='cancelled'&&(input.role===prior.from||input.role==='bruce')))fail('Only the receiving role can report progress.',403)
  if(['cancelled','reported-complete'].includes(prior.status))fail('This handoff is closed. Create a new follow-up.',409)
  if(!Number.isInteger(input.version)||input.version!==prior.version||!entry.etag)fail('This handoff changed. Refresh before updating.',409)
  const note=text(input.note,2000,'Progress or completion evidence')
  if(prior.history.length>=100)fail('This handoff has reached its history limit. Create a follow-up.')
  const at=now().toISOString(),row={...prior,status:target,version:prior.version+1,updatedAt:at,history:[...prior.history,{at,actor:session.member,role:input.role,status:target,note}]}
  const saved=await store.setJSON(key(input.id),row,{onlyIfMatch:entry.etag})
  if(saved?.modified===false)fail('Another update arrived while saving. Refresh before retrying.',409)
  return {row}
 }
 return {list,get,create,change}
}
export const productionExecutiveRepository=()=>createExecutiveRepository({store:getStore({name:'brevity-executive-workspace',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN}),root:`${process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'}/`})
export {EXECUTIVE_ROLES}
