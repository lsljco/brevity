import '../lib/native-runtime.mjs'
import {createHash} from 'node:crypto'
import householdAuth from '../lib/household-auth.cjs'
import {HOUSEHOLD_MEMBERS} from '../../src/homehq/projectData.js'
import {householdClock} from '../../src/household/dailyRhythm.js'
import {buildDailyResponsibilities} from '../../src/household/dailyResponsibilities.js'
import {briefingStore,loadDailyBriefingInputs,financeBriefAllowed} from '../lib/daily-briefing-source.mjs'
import {dailyFinancialBrief} from '../lib/daily-financial-brief.mjs'
import {reminderRoot} from '../lib/personal-reminders.mjs'
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}})
const revision=brief=>createHash('sha256').update(JSON.stringify(brief.items.map(({id,title,time,endTime,owners})=>[id,title,time,endTime,owners]))).digest('hex')
export function createDailyBriefingHandler({authenticate=householdAuth.readSession,load=loadDailyBriefingInputs,storeFactory=briefingStore,now=()=>new Date()}={}){return async request=>{
 const session=await authenticate({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
 if(!session)return json(401,{error:'Sign in to see your daily briefing.'})
 if(!HOUSEHOLD_MEMBERS.includes(session.member))return json(403,{error:'Household member required.'})
 if(!['GET','POST'].includes(request.method))return json(405,{error:'Method not allowed.'})
 try{
  const time=now(),date=householdClock(time).date,input=await load(date,{now:time}),store=storeFactory(),root=reminderRoot(),key=`${root}days/${date}/${session.member}`
  const entry=await store.getWithMetadata(key,{type:'json'}),saved=entry?.data||{},brief=buildDailyResponsibilities(input,session.member,time,saved.reports),version=revision(brief)
  if(request.method==='POST'){
   const body=await request.json().catch(()=>({}))
   if(body.date!==date||body.revision!==version)return json(409,{error:'Your day changed. Refresh the briefing before updating it.'})
   if(!['acknowledge','in-progress','needs-help','clear'].includes(body.action))return json(400,{error:'Choose acknowledgement, progress, or help. Completion requires the task’s reviewed workflow.'})
   if(body.action!=='acknowledge'&&!brief.items.some(item=>item.id===body.itemId))return json(403,{error:'Only your current assignments can be updated here.'})
   const next={...saved,member:session.member,date,updatedAt:time.toISOString(),...(body.action==='acknowledge'?{acknowledgedAt:time.toISOString(),acknowledgedRevision:version}:{reports:{...saved.reports,[body.itemId]:{state:body.action==='clear'?'scheduled':body.action,at:time.toISOString(),by:session.member}}})}
   const write=await store.setJSON(key,next,entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true})
   if(write?.modified!==true)return json(409,{error:'Your briefing changed on another device. Refresh and retry.'})
   return json(200,{ok:true})
  }
  const household=[]
  if(session.role==='admin')for(const member of HOUSEHOLD_MEMBERS){
   const state=member===session.member?saved:await store.get(`${root}days/${date}/${member}`,{type:'json'})||{}
   const model=buildDailyResponsibilities(input,member,time,state.reports)
   household.push({member,acknowledged:state.acknowledgedRevision===revision(model),acknowledgedAt:state.acknowledgedAt||'',counts:model.counts})
  }
  // Unassigned household work is visible to the administrator; a member sees their own timing gaps.
  if(session.role!=='admin')brief.gaps=brief.gaps.filter(gap=>gap.owners?.includes(session.member))
  return json(200,{brief,revision:version,acknowledged:saved.acknowledgedRevision===version,acknowledgedAt:saved.acknowledgedAt||'',household,finance:financeBriefAllowed(session.member,session.role,input.permissions)?dailyFinancialBrief(input):null})
 }catch{return json(503,{error:'Your briefing is temporarily unavailable. No assignments were changed. Try again.'})}
}}
export default createDailyBriefingHandler()
