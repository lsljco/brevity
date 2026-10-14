import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {householdClock} from '../../src/household/dailyRhythm.js'
import {loadOpenWork} from '../lib/open-work.mjs'
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}})
export function createOpenWorkHandler({authenticate=householdAuth.readSession,load=loadOpenWork,now=()=>new Date()}={}){return async request=>{
 const session=await authenticate({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
 if(!session)return json(401,{error:'Sign in to see household work.'})
 if(request.method!=='GET')return json(405,{error:'Method not allowed.'})
 const date=new URL(request.url).searchParams.get('date')||householdClock(now()).date
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)return json(400,{error:'A valid date is required.'})
 try{return json(200,{date,items:await load(date)})}catch{return json(503,{error:'Open work could not be loaded. Your unfinished items have not been cleared.'})}
}}
export default createOpenWorkHandler()
