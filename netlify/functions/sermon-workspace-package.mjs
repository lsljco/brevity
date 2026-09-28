import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'
import { workspaceKey,packageKey,pointerKey,deckKey,safeId,sermonSourceHash,sermonJobId,applyPackage } from '../lib/sermon-workspace-package.mjs'
const {readSession}=householdAuth
const store=()=>getStore({name:'brevity-sermon-repository',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'},body:JSON.stringify(body)})
const backgroundUrl=event=>`${String(event.headers?.['x-forwarded-proto']||'https').split(',')[0]}://${String(event.headers?.['x-forwarded-host']||event.headers?.host||'brevityoflife.netlify.app').split(',')[0]}/.netlify/functions/sermon-workspace-package-background`
export function createSermonWorkspacePackageHandler({authenticate=readSession,dataStoreFactory=store,dispatch=fetch,now=()=>new Date()}={}){
 return async event=>{try{
  const session=await authenticate(event);if(!session?.member)return json(401,{error:'Sign in to generate sermon materials.'})
  const dataStore=dataStoreFactory(),query=event.queryStringParameters||{}
  if(event.httpMethod==='GET'&&query.download){if(!safeId(query.download))return json(400,{error:'Invalid deck id.'});const status=await dataStore.get(packageKey(query.download),{type:'json'});if(status?.state!=='ready')return json(404,{error:'Slide deck not ready.'});const bytes=await dataStore.get(deckKey(query.download),{type:'arrayBuffer'});if(!bytes)return json(404,{error:'Slide deck not found.'});return {statusCode:200,isBase64Encoded:true,headers:{'content-type':'application/vnd.openxmlformats-officedocument.presentationml.presentation','content-disposition':`attachment; filename="sermon-${query.download}.pptx"`,'cache-control':'private, no-store'},body:Buffer.from(bytes).toString('base64')}}
  if(event.httpMethod==='GET'){if(!safeId(query.sermonId))return json(400,{error:'Choose a sermon.'});const workspace=await dataStore.get(workspaceKey,{type:'json'}),sermon=workspace?.sermons?.find(item=>item.id===query.sermonId);if(!sermon)return json(404,{error:'Sermon not found.'});const pointer=await dataStore.get(pointerKey(query.sermonId),{type:'json'});const status=pointer?.id?await dataStore.get(packageKey(pointer.id),{type:'json'}):null;const hash=sermonSourceHash(sermon);if(status?.sourceHash!==hash||status?.id!==sermonJobId(sermon.id,hash))return json(200,{state:'not-started'});if(['queued','processing'].includes(status.state)&&now().getTime()-new Date(status.updatedAt||status.createdAt).getTime()>10*60*1000)return json(200,{...status,state:'error',error:'Generation took too long. Retry the draft package.'});return json(200,status)}
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  const body=JSON.parse(event.body||'{}');if(!safeId(body.sermonId))return json(400,{error:'Choose a sermon.'})
  const workspace=await dataStore.get(workspaceKey,{type:'json'}),sermon=workspace?.sermons?.find(item=>item.id===body.sermonId)
  if(!sermon)return json(404,{error:'Sermon not found.'})
  if(body.action==='apply'){
    if(!safeId(body.jobId))return json(400,{error:'Invalid generation job.'})
    if(body.baseRevision!==workspace.revision)return json(409,{error:'The Workspace changed. Refresh and review before applying generated materials.'})
    const status=await dataStore.get(packageKey(body.jobId),{type:'json'});if(!status||status.sermonId!==sermon.id||status.state!=='ready')return json(409,{error:'The generated package is not ready.'})
    const updated=applyPackage(workspace,sermon.id,status,session.member,now());if(updated!==workspace)await dataStore.setJSON(workspaceKey,updated);return json(200,{workspace:updated,status})
  }
  if(body.action!=='start')return json(400,{error:'Unknown generation action.'})
  if(body.baseRevision!==workspace.revision)return json(409,{error:'The Workspace changed. Refresh before generating.'})
  if(String(sermon.outline||'').trim().length<80)return json(400,{error:'Add and save at least 80 characters of sermon text before generating materials.'})
  const hash=sermonSourceHash(sermon),id=sermonJobId(sermon.id,hash)
  let status=await dataStore.get(packageKey(id),{type:'json'})
  const stalled=status&&['queued','processing'].includes(status.state)&&now().getTime()-new Date(status.updatedAt||status.createdAt).getTime()>10*60*1000
  if(!status||status.state==='error'||stalled){
    status={id,sermonId:sermon.id,sourceHash:hash,baseRevision:workspace.revision,state:'queued',requestedBy:session.member,createdAt:now().toISOString()}
    await dataStore.setJSON(packageKey(id),status);await dataStore.setJSON(pointerKey(sermon.id),{id})
    const response=await dispatch(backgroundUrl(event),{method:'POST',headers:{'content-type':'application/json',cookie:event.headers?.cookie||event.headers?.Cookie||''},body:JSON.stringify({id})})
    if(!response.ok&&response.status!==202){status={...status,state:'error',error:'Could not queue generation. Try again.'};await dataStore.setJSON(packageKey(id),status);return json(502,{error:status.error})}
  }else await dataStore.setJSON(pointerKey(sermon.id),{id})
  return json(202,status)
 }catch(error){console.error('[sermon-workspace-package]',error);return json(500,{error:'Could not prepare sermon materials.'})}}
}
export const handler=createSermonWorkspacePackageHandler()
