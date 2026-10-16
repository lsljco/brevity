import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {HOUSEHOLD_MEMBERS} from '../../src/homehq/projectData.js'
import {householdClock} from '../../src/household/dailyRhythm.js'
import {validateCheckin,checkinStatus} from '../../src/household/householdCheckin.js'
import {briefingStore,loadDailyBriefingInputs} from '../lib/daily-briefing-source.mjs'
import {checkinSource,checkinKey,loadCheckinMeeting} from '../lib/household-checkins.mjs'
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}})
export function createCheckinHandler({authenticate=householdAuth.readSession,load=loadDailyBriefingInputs,storeFactory=briefingStore,now=()=>new Date(),meeting=loadCheckinMeeting}={}){return async request=>{
 const session=await authenticate({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
 if(!session)return json(401,{error:'Sign in to provide your own household update.'})
 if(!HOUSEHOLD_MEMBERS.includes(session.member))return json(403,{error:'Household member required.'})
 if(!['GET','POST'].includes(request.method))return json(405,{error:'Method not allowed.'})
 const time=now(),clock=householdClock(time),date=clock.date
 try{
  if(request.method==='POST'&&request.headers.get('origin')&&new URL(request.headers.get('origin')).origin!==new URL(request.url).origin)return json(403,{error:'Submit from Brevity.'})
  const input=await load(date,{now:time}),source=checkinSource(input,session.member,time),store=storeFactory(),key=checkinKey(date,session.member)
  const entry=await store.getWithMetadata(key,{type:'json'}),record=entry?.data||null
  if(request.method==='GET')return json(200,{source,record,status:checkinStatus(record,source.revision,clock.minute),meeting:session.role==='admin'?await meeting(date,{store,input,now:time}):null})
  const raw=await request.text();if(raw.length>120000)return json(413,{error:'Check-in is too large.'})
  let body;try{body=JSON.parse(raw)}catch{return json(400,{error:'Invalid check-in request.'})}
  if(body.member!==session.member)return json(403,{error:'Each person must submit their own check-in.'})
  if(body.date!==date||body.version!==(record?.version||0)||body.sourceRevision!==source.revision)return json(409,{error:'Your day or check-in changed. Reload the current commitments before saving.'})
  if(!['draft','submit','undo'].includes(body.action))return json(400,{error:'Choose save draft, submit, or undo.'})
  let response
  try{response=body.action==='undo'?record?.history?.at(-1)?.before?.response:validateCheckin(body.response,source,body.action==='submit')}catch(error){return json(400,{error:error.message})}
  if(body.action==='undo'&&!record?.history?.length)return json(400,{error:'There is no prior check-in version.'})
  const before=record?Object.fromEntries(Object.entries(record).filter(([k])=>k!=='history')):null
  const restored=body.action==='undo'?record.history.at(-1).before:null
  const next={member:session.member,date,version:(record?.version||0)+1,response:response||null,source:restored?.source||source,sourceRevision:restored?.sourceRevision||source.revision,submittedAt:body.action==='submit'?time.toISOString():body.action==='undo'?restored?.submittedAt||'':'',updatedAt:time.toISOString(),history:[...(record?.history||[]),{version:(record?.version||0)+1,action:body.action,by:session.member,at:time.toISOString(),before}]}
  const written=await store.setJSON(key,next,entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true})
  if(written?.modified!==true)return json(409,{error:'Another device saved first. Reload before trying again.'})
  return json(200,{ok:true,record:next})
 }catch{return json(503,{error:'Check-ins are temporarily unavailable. Your operating records were not changed.'})}
}}
export default createCheckinHandler()
