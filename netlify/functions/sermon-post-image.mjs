import {withLambda} from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import { randomUUID } from 'node:crypto'
import { getStore } from '../lib/scoped-store.mjs'
import householdAuth from '../lib/household-auth.cjs'
import { workspaceKey,safeId } from '../lib/sermon-workspace-package.mjs'
import { COVER_STORE,COVER_JOB_STORE,SERMON_IDENTITY_STORE,SERMON_PHOTO_SUBJECTS,sermonIdentityMetaKey,coverKey,postImageJobKey,postImageSourceHash,defaultPostSubject } from '../lib/sermon-cover.mjs'

const {readSession}=householdAuth
const householdId=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
const store=name=>getStore({name,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'},body:JSON.stringify(body)})
const backgroundUrl=event=>`${String(event.headers?.['x-forwarded-proto']||'https').split(',')[0]}://${String(event.headers?.['x-forwarded-host']||event.headers?.host||'brevityoflife.netlify.app').split(',')[0]}/.netlify/functions/sermon-post-image-background`

export function createPostImageHandler({authenticate=readSession,repositoryFactory=()=>store('brevity-sermon-repository'),jobFactory=()=>store(COVER_JOB_STORE),imageFactory=()=>store(COVER_STORE),identityFactory=()=>store(SERMON_IDENTITY_STORE),dispatch=fetch,now=()=>new Date()}={}){
 return async event=>{try{
  const session=await authenticate(event);if(!session?.member)return json(401,{error:'Sign in to view sermon photography.'})
  const query=event.queryStringParameters||{},body=event.httpMethod==='POST'?JSON.parse(event.body||'{}'):query
  if(!safeId(body.sermonId)||!safeId(body.postId))return json(400,{error:'Choose a Facebook post.'})
  const sermon=(await repositoryFactory().get(workspaceKey,{type:'json'}))?.sermons?.find(item=>item.id===body.sermonId)
  const post=sermon?.assets?.find(item=>item.id===body.postId&&item.type==='facebook')
  if(!post)return json(404,{error:'Facebook post not found.'})
  const jobs=jobFactory(),key=postImageJobKey(householdId,sermon.id,post.id),current=await jobs.get(key,{type:'json'})
  if(event.httpMethod==='GET'&&query.image==='1'){
   if(current?.state!=='ready')return json(404,{error:'Image not ready.'})
   const bytes=await imageFactory().get(coverKey(householdId,current.assetId),{type:'arrayBuffer'})
   if(!bytes)return json(404,{error:'Image not found.'})
   return {statusCode:200,isBase64Encoded:true,headers:{'content-type':'image/png','cache-control':'private, max-age=3600'},body:Buffer.from(bytes).toString('base64')}
  }
  const subject=current?.subject&&SERMON_PHOTO_SUBJECTS.includes(current.subject)?current.subject:defaultPostSubject(post)
  const identityVersion=async member=>member==='none'?'':(await identityFactory().get(sermonIdentityMetaKey(householdId,member),{type:'json'}))?.version||'household-reference'
  const sourceHash=postImageSourceHash(sermon,post,subject,await identityVersion(subject))
  if(event.httpMethod==='GET'){
   if(current&&['queued','generating'].includes(current.state)&&now().getTime()-new Date(current.updatedAt||current.createdAt).getTime()>12*60*1000)return json(200,{...current,state:'error',error:'The image took too long. Try again.'})
   return json(200,current?.sourceHash===sourceHash?current:{state:'not-started',sermonId:sermon.id,postId:post.id})
  }
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  const chosen=body.subject===undefined?subject:body.subject
  if(!SERMON_PHOTO_SUBJECTS.includes(chosen))return json(400,{error:'Choose a household member or a scene without people.'})
  const chosenHash=postImageSourceHash(sermon,post,chosen,await identityVersion(chosen))
  if(current?.sourceHash===chosenHash&&current.state==='ready'&&!body.regenerate)return json(200,current)
  if(current?.sourceHash===chosenHash&&['queued','generating'].includes(current.state)&&now().getTime()-new Date(current.updatedAt||current.createdAt).getTime()<12*60*1000)return json(202,current)
  const status={id:randomUUID(),sermonId:sermon.id,postId:post.id,assetId:randomUUID(),subject:chosen,sourceHash:chosenHash,state:'queued',requestedBy:session.member,createdAt:now().toISOString()}
  await jobs.setJSON(key,status)
  const response=await dispatch(backgroundUrl(event),{method:'POST',headers:{'content-type':'application/json',cookie:event.headers?.cookie||event.headers?.Cookie||''},body:JSON.stringify({sermonId:sermon.id,postId:post.id,jobId:status.id})})
  if(!response.ok&&response.status!==202){await jobs.setJSON(key,{...status,state:'error',error:'Could not queue photography.'});return json(502,{error:'Could not queue photography.'})}
  return json(202,status)
 }catch(error){console.error('[sermon-post-image]',error);return json(500,{error:'Could not prepare sermon photography.'})}}
}
const handler=createPostImageHandler()

export default withLambda(handler)

export {handler as lambdaHandler}
