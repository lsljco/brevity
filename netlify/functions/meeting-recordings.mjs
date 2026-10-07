import {withLambda} from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {getStore} from '../lib/scoped-store.mjs'
import {createHash} from 'node:crypto'
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'private, no-store'},body:JSON.stringify(body)})
export function createMeetingRecordingsHandler({authenticate=householdAuth.readSession,storeFactory=()=>getStore({name:'brevity-meeting-recordings',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})}={}){
 return async event=>{
  const session=await authenticate(event).catch(()=>null)
  if(!session)return json(401,{error:'Sign in to access your meeting recordings.'})
  if(!['GET','PUT','POST'].includes(event.httpMethod))return json(405,{error:'Method not allowed.'})
  const q=event.queryStringParameters||{},id=q.id||''
  if(q.member&&q.member!==session.member)return json(403,{error:'The signed-in member changed. Sign back in as the recording owner to finish backup.'})
  if(id&&!/^[a-zA-Z0-9-]{16,80}$/.test(id))return json(400,{error:'Invalid meeting identity.'})
  const owner=createHash('sha256').update(`${process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'}:${session.member}`).digest('hex')
  const root=`${owner}/`,meta=`${root}records/${id}`,audio=`${root}audio/${id}/`
  try{
   const store=storeFactory()
   if(event.httpMethod==='GET'&&!id){const page=await store.list({prefix:`${root}records/`,...(q.cursor?{cursor:q.cursor}:{})});const meetings=await Promise.all(page.blobs.map(row=>store.get(row.key,{type:'json'})));return json(200,{meetings:meetings.filter(Boolean),cursor:page.cursor||null})}
   if(!id)return json(400,{error:'A meeting identity is required.'})
   if(q.chunk!==undefined){
    const index=Number(q.chunk)
    if(!/^\d+$/.test(q.chunk)||!Number.isInteger(index)||index<0||index>100000)return json(400,{error:'Invalid audio portion.'})
    const chunkKey=`${audio}${String(index).padStart(6,'0')}`
    if(event.httpMethod==='POST'){
     const mime=String(event.headers?.['content-type']||'audio/webm').toLowerCase()
     if(!/^audio\/(webm|mp4|ogg)(;.*)?$/.test(mime))return json(400,{error:'Unsupported recording format.'})
     const bytes=Buffer.from(event.body||'',event.isBase64Encoded?'base64':'binary')
     if(!bytes.length||bytes.length>4_000_000)return json(413,{error:'Audio portion must be between one byte and 4 MB.'})
     await store.setJSON(chunkKey,{mime,data:bytes.toString('base64')},{onlyIfNew:true})
     return json(200,{saved:true,index})
    }
    if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed.'})
    const chunk=await store.get(chunkKey,{type:'json'})
    if(!chunk)return json(404,{error:'Recording portion not found.'})
    return {statusCode:200,isBase64Encoded:true,headers:{'content-type':chunk.mime,'cache-control':'private, no-store','x-content-type-options':'nosniff'},body:chunk.data}
   }
   if(event.httpMethod==='PUT'){
    if((event.body||'').length>1_000_000)return json(413,{error:'Meeting transcript is too large.'})
    let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid meeting record.'})}
    if(body.member&&body.member!==session.member)return json(403,{error:'Only the recording owner can save this meeting.'})
    if(!/^\d{4}-\d{2}-\d{2}$/.test(body.date||'')||!Number.isFinite(Date.parse(body.startedAt)))return json(400,{error:'The meeting date is required.'})
    const record={id,member:session.member,title:String(body.title||'Meeting').slice(0,200),date:body.date,kind:body.kind==='finance'?'finance':'alignment',timing:body.timing==='today'?'today':'tomorrow',startedAt:body.startedAt,endedAt:body.endedAt||null,status:['recording','stopped','interrupted','draft'].includes(body.status)?body.status:'interrupted',transcript:String(body.transcript||'').slice(0,600000),notes:String(body.notes||'').slice(0,50000),mime:/^audio\/(webm|mp4|ogg)/.test(body.mime||'')?body.mime:'audio/webm',chunkCount:Math.max(0,Math.min(100001,Number(body.chunkCount)||0)),transcriptionErrors:Array.isArray(body.transcriptionErrors)?body.transcriptionErrors.slice(0,500):[],updatedAt:Number.isFinite(Date.parse(body.updatedAt))?body.updatedAt:new Date().toISOString(),syncedAt:new Date().toISOString()}
    for(let attempt=0;attempt<4;attempt++){
     const entry=await store.getWithMetadata(meta,{type:'json'})
     if(entry?.data?.updatedAt>record.updatedAt)return json(200,{saved:true,record:entry.data})
     const saved=await store.setJSON(meta,record,entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true})
     if(saved?.modified!==false)return json(200,{saved:true,record})
    }
    return json(409,{error:'The meeting was updated elsewhere. Reload Meeting History before retrying.'})
   }
   if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed.'})
   const record=await store.get(meta,{type:'json'})
   if(!record)return json(404,{error:'Meeting not found.'})
   const chunks=[];let cursor
   do{const page=await store.list({prefix:audio,...(cursor?{cursor}:{})});chunks.push(...page.blobs.map(row=>Number(row.key.slice(audio.length))));cursor=page.cursor}while(cursor)
   return json(200,{record,chunks:chunks.sort((a,b)=>a-b)})
  }catch{return json(503,{error:'Meeting backup is unavailable. Your device copy can be retried.'})}
 }
}
export const lambdaHandler=createMeetingRecordingsHandler()
export default withLambda(lambdaHandler)
