import {withLambda} from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import {getStore} from '../lib/scoped-store.mjs'
import auth from '../lib/household-auth.cjs'
import {randomUUID} from 'node:crypto'
import {normalizeCare} from '../../src/health/healthCare.js'
export function createHealthCareHandler({readSession=auth.readSession,store,createId=randomUUID}={}){return async event=>{
 const reply=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)})
 const session=await readSession(event).catch(()=>null)
 if(!session)return reply(401,{error:'Sign in to view household care.'})
 try{
 const db=store||getStore({name:'brevity-health-care',consistency:'strong'}),key=`${process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'}/care`
 const entry=await db.getWithMetadata(key,{type:'json'}),current=entry?.data||{version:0,items:[],audit:[]}
 // These are explicitly shared household coordination records, separate from private Apple Health measurements.
 if(event.httpMethod==='GET')return reply(200,{version:current.version,items:current.items})
 if(event.httpMethod!=='POST')return reply(405,{error:'Method not allowed.'})
 if(!String(event.headers?.['content-type']||event.headers?.['Content-Type']||'').startsWith('application/json'))return reply(415,{error:'Use a JSON care update.'})
 if(Buffer.byteLength(event.body||'')>12000)return reply(413,{error:'Care update is too large.'})
 let body;try{body=JSON.parse(event.body||'')}catch{return reply(400,{error:'Invalid care update.'})}
 if(body.version!==current.version)return reply(409,{error:'Household care changed on another device. Refresh before saving.'})
 let item;try{item=normalizeCare(body.item||{})}catch(error){return reply(400,{error:error.message})}
 const before=body.id?current.items.find(x=>x.id===body.id):null
 if(body.id&&!before)return reply(404,{error:'This care item no longer exists.'})
 if(session.role!=='admin'&&(item.member!==session.member||before&&before.member!==session.member))return reply(403,{error:'You may update your own care items. A household administrator can coordinate care for others.'})
 const at=new Date().toISOString(),saved={...item,id:before?.id||createId(),updatedAt:at,updatedBy:session.member}
 const next={version:current.version+1,items:before?current.items.map(x=>x.id===before.id?saved:x):[...current.items,saved],audit:[...(current.audit||[]),{at,actor:session.member,before,after:saved}].slice(-200)}
 const result=await db.setJSON(key,next,entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true})
 if(result?.modified===false)return reply(409,{error:'Household care changed while saving. Refresh and retry.'})
 return reply(200,{version:next.version,items:next.items})
 }catch{return reply(503,{error:'Household care is temporarily unavailable. Please retry.'})}
}}
export default withLambda(createHealthCareHandler())
