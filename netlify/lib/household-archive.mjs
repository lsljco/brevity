import {getStore} from './scoped-store.mjs'
import {createHash} from 'node:crypto'
import {householdClock} from '../../src/household/dailyRhythm.js'
import {routineOccurrencesForDate,normalizeHouseholdScheduleState} from '../../src/household/householdScheduleData.js'
import {buildHouseholdMaintenanceWeek,householdOccurrence,occurrenceStatus} from '../../src/household/householdMaintenanceData.js'
export const archiveDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value
export function archiveCutoff(today){const d=new Date(today+'T12:00:00Z');d.setUTCFullYear(d.getUTCFullYear()-1);return d.toISOString().slice(0,10)}
const parse=record=>typeof record?.value==='string'?JSON.parse(record.value):record?.value||{}
export async function archiveKeys(store,prefix){const keys=[];let cursor;do{const page=await store.list({prefix,...(cursor?{cursor}:{})});keys.push(...page.blobs.map(x=>x.key));cursor=page.cursor}while(cursor);return keys}
export function createHouseholdArchive({plans,shared,archive,meetings,actions,householdId='lslj-family',now=()=>new Date()}){
 const root=householdId+'/',today=()=>householdClock(now()).date
 async function day(date){
  const saved=await archive.get(root+'days/'+date,{type:'json'})
  if(saved)return saved.expired?null:saved
  const plan=await plans.get(root+'daily-plans/'+date,{type:'json'})
  return plan?{date,kind:'day',title:plan.household?.keyFocus||plan.dayObjective||'Daily household plan',capturedAt:plan.updatedAt||null,coverage:'Saved daily plan only; historical calendar and chore states were not captured.',plan,pinned:false}:null
 }
 async function capture(){
  const date=today(),[plan,scheduleRecord,maintenanceRecord,calendarRecord]=await Promise.all([plans.get(root+'daily-plans/'+date,{type:'json'}),shared.get(root+'records/brevity_household_schedule_v1',{type:'json'}),shared.get(root+'records/brevity_household_maintenance_v1',{type:'json'}),shared.get(root+'records/family_calendar_events_v1',{type:'json'})])
  const schedule=normalizeHouseholdScheduleState(parse(scheduleRecord)),maintenance=parse(maintenanceRecord)
  const chores=buildHouseholdMaintenanceWeek(new Date(date+'T12:00:00'),maintenance).find(x=>x.date===date)?.tasks.map(x=>({...x,occurrence:householdOccurrence(maintenance,x),status:occurrenceStatus(x,householdOccurrence(maintenance,x))}))||[]
  const snapshot={date,kind:'day',title:plan?.household?.keyFocus||plan?.dayObjective||'Daily household records',capturedAt:now().toISOString(),coverage:'Saved plan and Brevity schedule/calendar/chores at capture time. Apple-only events and private health logs are not included.',plan,chores,schedule:[...routineOccurrencesForDate(schedule,date),...schedule.blocks.filter(x=>x.date===date)],calendar:(Array.isArray(parse(calendarRecord))?parse(calendarRecord):[]).filter(x=>x.date<=date&&(x.endDate||x.date)>=date)}
  for(let attempt=0;attempt<4;attempt++){
   const key=root+'days/'+date,entry=await archive.getWithMetadata(key,{type:'json'})
   const result=await archive.setJSON(key,{...snapshot,pinned:entry?.data?.pinned||false},entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true})
   if(result?.modified!==false)return {captured:true,date}
  }
  throw Error('Archive changed during capture; retry later.')
 }
 async function search({query='',from='',to='',member='',pillar='',kind='day',cursor='0',limit=20}={},session){
  if(!['day','meeting','changes'].includes(kind))throw Error('Invalid record type.');
  const cutoff=archiveCutoff(today()),start=from||cutoff,end=to||today()
  if(!archiveDate(start)||!archiveDate(end)||start>end)throw Error('Choose a valid date range.')
  const offset=Number(cursor);if(!Number.isInteger(offset)||offset<0)throw Error('Invalid archive page.')
  let keys,store
  if(kind==='changes'){store=actions;keys=(await archiveKeys(store,root+'audits/')).reverse()}else if(kind==='meeting'){
   const owner=createHash('sha256').update(`${householdId}:${session.member}`).digest('hex');store=meetings;keys=await archiveKeys(store,owner+'/records/')
  }else{
   store=archive;const [a,p]=await Promise.all([archiveKeys(archive,root+'days/'),archiveKeys(plans,root+'daily-plans/')]);keys=[...new Set([...a,...p].map(x=>x.split('/').at(-1)))].filter(archiveDate).sort().reverse()
  }
  const rows=[],pageSize=Math.min(30,Math.max(1,limit));let index=offset,scanned=0
  while(index<keys.length&&rows.length<pageSize&&scanned<100){
   const key=keys[index++];scanned++
   let row=kind==='meeting'||kind==='changes'?await store.get(key,{type:'json'}):await day(key)
   if(kind==='changes'&&row){
    const operations=(row.operations||[]).filter(x=>/^(plan\.|assignment\.|decision\.|household\.schedule\.|household\.maintenance\.)/.test(x.type))
    if(!operations.length)continue
    row={id:row.id,date:householdClock(new Date(row.occurredAt)).date,title:row.summary,kind:'changes',actor:row.actor,occurredAt:row.occurredAt,operations:operations.map(({type,description,targetDate})=>({type,description,targetDate})),coverage:'Immutable reviewed operational action history. Other private or financial audit records remain in their source workspaces.'}
   }
   if(!row)continue
   const date=row.date,protectedRow=row.pinned||row.kind==='finance'
   if(date<cutoff&&!protectedRow)continue
   if((from&&date<start)||date>end||(!from&&date<start&&!protectedRow))continue
   if(member&&!JSON.stringify(row).includes(member))continue
   const content=pillar==='household'?(row.plan?.household||row.chores?.length||row.schedule?.length||row.calendar?.length?{household:row.plan?.household,chores:row.chores,schedule:row.schedule,calendar:row.calendar}:null):pillar?row.plan?.[pillar]:row
   if(pillar&&!content)continue
   if(query&&!JSON.stringify(content).toLowerCase().includes(String(query).slice(0,200).toLowerCase()))continue
   rows.push(kind==='meeting'?{...row,kind:'meeting',recordingKind:row.kind,coverage:'Owner-only meeting transcript and notes. Audio remains in Meeting History.'}:row)
  }
  return {rows,cursor:index<keys.length?String(index):null,cutoff,retention:'Rolling 12 months; pinned records remain. Source financial, tax, property and sermon records are not deleted by this archive.',notice:'Archives report saved records, not inferred completion. Missing historical snapshots cannot be reconstructed.',scanned}
 }
 async function pin(date,pinned,session){
  if(session.role!=='admin')throw Object.assign(Error('Administrator access is required to pin shared history.'),{status:403})
  if(!archiveDate(date))throw Error('Invalid archive date.')
  const snapshot=await day(date);if(!snapshot)throw Error('Archived day not found.')
  const key=root+'days/'+date
  for(let i=0;i<4;i++){const entry=await archive.getWithMetadata(key,{type:'json'});if(entry?.data?.expired)throw Error('Archived day has expired.');const result=await archive.setJSON(key,{...(entry?.data||snapshot),pinned:Boolean(pinned)},entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true});if(result?.modified!==false)return {saved:true,pinned:Boolean(pinned)}}
  throw Error('Archive changed. Retry pinning.')
 }
 // Only disposable archive copies expire. Canonical financial/property/sermon
 // records and audit evidence never pass through this cleanup path.
 async function prune(){
  let removed=0;const cutoff=archiveCutoff(today())
  for(const key of await archiveKeys(archive,root+'days/')){
   const entry=await archive.getWithMetadata(key,{type:'json'}),row=entry?.data
   if(row&&!row.expired&&row.date<cutoff&&!row.pinned&&entry.etag){
    const result=await archive.setJSON(key,{date:row.date,expired:true,pinned:false},{onlyIfMatch:entry.etag})
    if(result?.modified!==false)removed++
   }
  }
  return {removed}
 }

 return {day,capture,search,pin,prune}
}
export function productionHouseholdArchive(){const store=name=>getStore({name,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN});return createHouseholdArchive({plans:store('brevity-household'),shared:store('brevity-household-state'),archive:store('brevity-household-archive'),meetings:store('brevity-meeting-recordings'),actions:store('brevity-assistant-actions'),householdId:process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'})}
