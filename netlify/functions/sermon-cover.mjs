import { randomUUID } from 'node:crypto'
import { getStore } from '../lib/scoped-store.mjs'
import householdAuth from './household-auth.js'
import { workspaceKey, safeId } from '../lib/sermon-workspace-package.mjs'
import { COVER_STORE,COVER_JOB_STORE,coverKey,coverJobKey,coverSourceHash } from '../lib/sermon-cover.mjs'

const {readSession}=householdAuth
const householdId=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
const repository=()=>getStore({name:'brevity-sermon-repository',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const jobs=()=>getStore({name:COVER_JOB_STORE,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const images=()=>getStore({name:COVER_STORE,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'},body:JSON.stringify(body)})
const backgroundUrl=event=>`${String(event.headers?.['x-forwarded-proto']||'https').split(',')[0]}://${String(event.headers?.['x-forwarded-host']||event.headers?.host||'brevityoflife.netlify.app').split(',')[0]}/.netlify/functions/sermon-cover-background`

export function createSermonCoverHandler({authenticate=readSession,repositoryFactory=repository,jobFactory=jobs,imageFactory=images,dispatch=fetch,now=()=>new Date()}={}){
 return async event=>{try{
  const session=await authenticate(event);if(!session?.member)return json(401,{error:'Sign in to view sermon covers.'})
  const data=repositoryFactory(),jobStore=jobFactory(),query=event.queryStringParameters||{}
  if(event.httpMethod==='GET'&&query.assetId){
   if(!safeId(query.assetId))return json(400,{error:'Invalid cover id.'})
   const sermons=(await data.get(workspaceKey,{type:'json'}))?.sermons||[]
   let authorized=false
   for(const sermon of sermons){const status=await jobStore.get(coverJobKey(householdId,sermon.id),{type:'json'});if(status?.state==='ready'&&status.assetId===query.assetId){authorized=true;break}}
   if(!authorized)return json(404,{error:'Cover not found.'})
   const bytes=await imageFactory().get(coverKey(householdId,query.assetId),{type:'arrayBuffer'})
   if(!bytes)return json(404,{error:'Cover not found.'})
   return {statusCode:200,isBase64Encoded:true,headers:{'content-type':'image/png','cache-control':'private, max-age=3600'},body:Buffer.from(bytes).toString('base64')}
  }
  if(event.httpMethod==='GET'){
   if(!safeId(query.sermonId))return json(400,{error:'Choose a sermon.'})
   const sermon=(await data.get(workspaceKey,{type:'json'}))?.sermons?.find(item=>item.id===query.sermonId)
   if(!sermon)return json(404,{error:'Sermon not found.'})
   const status=await jobStore.get(coverJobKey(householdId,sermon.id),{type:'json'})
   if(status&&status.sourceHash!==coverSourceHash(sermon))return json(200,{state:'not-started',sermonId:sermon.id})
   if(status&&['queued','generating'].includes(status.state)&&now().getTime()-new Date(status.updatedAt||status.createdAt).getTime()>12*60*1000)return json(200,{...status,state:'error',error:'The cover took too long. Try again.'})
   return json(200,status||{state:'not-started',sermonId:sermon.id})
  }
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  const body=JSON.parse(event.body||'{}');if(!safeId(body.sermonId))return json(400,{error:'Choose a sermon.'})
  const sermon=(await data.get(workspaceKey,{type:'json'}))?.sermons?.find(item=>item.id===body.sermonId)
  if(!sermon)return json(404,{error:'Sermon not found.'})
  if(!String(sermon.outline||sermon.bigIdea||'').trim()||sermon.title==='Untitled Sermon')return json(400,{error:'Save a sermon title and theme before creating its cover.'})
  const key=coverJobKey(householdId,sermon.id),current=await jobStore.get(key,{type:'json'})
  if(current&&['queued','generating'].includes(current.state)&&now().getTime()-new Date(current.updatedAt||current.createdAt).getTime()<12*60*1000)return json(202,current)
  if(current?.state==='ready'&&current.sourceHash===coverSourceHash(sermon)&&!body.regenerate)return json(200,current)
  const status={id:randomUUID(),sermonId:sermon.id,assetId:randomUUID(),sourceHash:coverSourceHash(sermon),state:'queued',requestedBy:session.member,createdAt:now().toISOString()}
  await jobStore.setJSON(key,status)
  const response=await dispatch(backgroundUrl(event),{method:'POST',headers:{'content-type':'application/json',cookie:event.headers?.cookie||event.headers?.Cookie||''},body:JSON.stringify({sermonId:sermon.id,jobId:status.id})})
  if(!response.ok&&response.status!==202){const failed={...status,state:'error',error:'Could not queue the cover image.'};await jobStore.setJSON(key,failed);return json(502,{error:failed.error})}
  return json(202,status)
 }catch(error){console.error('[sermon-cover]',error);return json(500,{error:'Could not prepare the sermon cover.'})}}
}
export const handler=createSermonCoverHandler()
