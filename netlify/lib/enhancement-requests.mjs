import {enhancementNotificationRecipients} from './enhancement-notifications.mjs'
import {randomUUID} from 'node:crypto'
import {getStore} from './scoped-store.mjs'
import {ENHANCEMENT_STATUSES,ENHANCEMENT_AREAS,canManageEnhancements,similarRequests} from '../../src/enhancements/model.js'
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})}
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${label} is required and must be at most ${max} characters.`);return value.trim()}
export const enhancementRoot=()=>`${process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'}/`
export const enhancementStore=()=>getStore({name:'brevity-enhancements',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
export function validateScreenshot(value){
 if(!value)return null
 if(typeof value!=='string'||value.length>1500000)fail('Use a screenshot smaller than 1 MB.')
 const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
 if(!match)fail('Use a PNG, JPEG, or WebP screenshot.')
 const bytes=Buffer.from(match[2],'base64'),kind=match[1]
 if(!(kind==='png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||kind==='jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255||kind==='webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'))fail('The screenshot format is invalid.')
 return value
}
export function createEnhancementRepository({store,root='lslj-family/',now=()=>new Date(),createId=randomUUID}){
 const key=id=>{if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id||''))fail('Invalid enhancement ID.');return root+'requests/'+id}
 const summarize=row=>{const {screenshot,seen,...rest}=row;return {...rest,hasScreenshot:Boolean(row.hasScreenshot||screenshot)}}
 async function rows(){const result=[];let cursor;do{const page=await store.list({prefix:root+'requests/',...(cursor?{cursor}:{})});result.push(...await Promise.all(page.blobs.map(blob=>store.get(blob.key,{type:'json'}))));cursor=page.cursor}while(cursor);return result.filter(Boolean).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}
 async function list(session){const records=await rows();return {rows:records.map(summarize),canManage:canManageEnhancements(session.member),member:session.member,updates:records.flatMap(row=>row.history.filter(event=>event.actor!==session.member&&event.at>(row.seen?.[session.member]||'')&&enhancementNotificationRecipients(row,event).includes(session.member)).map(event=>({...event,requestId:row.id,title:row.title}))).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,50)}}
 async function get(id){const row=await store.get(key(id),{type:'json'});if(!row)fail('Request not found.',404);return {...row,...(row.hasScreenshot?{screenshot:await store.get(root+'screenshots/'+id,{type:'json'})}:{})}}
 async function create(input,session){
  const title=text(input.title,140,'Title'),description=text(input.description,4000,'Request'),area=ENHANCEMENT_AREAS.includes(input.area)?input.area:'General'
  const id=text(input.id||createId(),100,'Request ID'),requestKey=key(id),existing=await store.get(requestKey,{type:'json'})
  if(existing){if(existing.createdBy!==session.member)fail('Request ID is already used.',409);return {row:summarize(existing),existing:true}}
  const all=await rows();if(all.length>=1000)fail('The request board is full. Ask Larry to review older requests.')
  const at=now().toISOString(),row={id,title,description,area,hasScreenshot:Boolean(input.screenshot),createdBy:session.member,createdAt:at,updatedAt:at,status:'Received',priority:'Normal',supporters:[session.member],comments:[],version:1,seen:{[session.member]:at},history:[{id:createId(),actor:session.member,at,kind:'created',text:'Request received.'}]}
  const screenshot=validateScreenshot(input.screenshot)
  if(screenshot)await store.setJSON(root+'screenshots/'+id,screenshot,{onlyIfNew:true})
  const result=await store.setJSON(requestKey,row,{onlyIfNew:true});if(result?.modified===false)fail('This request was just saved. Reload the board.',409)
  return {row:summarize(row),similar:similarRequests(`${title} ${description}`,all).map(summarize)}
 }
 async function change(input,session){
  for(let attempt=0;attempt<5;attempt++){
   const entry=await store.getWithMetadata(key(input.id),{type:'json'});if(!entry?.data)fail('Request not found.',404)
   const row=structuredClone(entry.data),at=now().toISOString();let event
   if(input.action==='support'){
    if(typeof input.support!=='boolean')fail('Choose whether to support this request.')
    row.supporters=input.support?[...new Set([...row.supporters,session.member])]:row.supporters.filter(member=>member!==session.member)
   }else if(input.action==='seen'){row.seen={...row.seen,[session.member]:at}}
   else if(input.action==='comment'){
    const body=text(input.text,2000,'Comment'),id=text(input.commentId,100,'Comment ID')
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))fail('Invalid comment ID.')
    if(row.comments.some(comment=>comment.id===id))return {row:summarize(row)}
    if(row.comments.length>=500)fail('This discussion has reached its comment limit.')
    row.comments.push({id,text:body,actor:session.member,at});event={id,actor:session.member,at,kind:'comment',text:body}
   }else if(input.action==='status'){
    if(!canManageEnhancements(session.member))fail('Only Larry and Terica can prioritize requests and change their status.',403)
    if(input.version!==row.version)fail('This request changed. Reload before updating its status.',409)
    if(!ENHANCEMENT_STATUSES.includes(input.status)||!['Low','Normal','High'].includes(input.priority))fail('Choose a valid status and priority.')
    const note=text(input.note,1000,'Update note')
    row.status=input.status;row.priority=input.priority;event={id:createId(),actor:session.member,at,kind:'status',text:`${row.status} · ${row.priority} priority — ${note}`}
   }else fail('Unsupported enhancement action.')
   if(event){row.history.push(event);row.seen={...row.seen,[session.member]:at}}
   if(input.action!=='seen'){row.version++;row.updatedAt=at}
   const saved=await store.setJSON(key(input.id),row,{onlyIfMatch:entry.etag})
   if(saved?.modified!==false)return {row:summarize(row)}
  }
  fail('The request changed during saving. Please retry.',409)
 }
 return {list,get,create,change,rows}
}
export const productionEnhancements=()=>createEnhancementRepository({store:enhancementStore(),root:enhancementRoot()})
