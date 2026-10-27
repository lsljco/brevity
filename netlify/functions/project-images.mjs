import '../lib/native-runtime.mjs'
import {randomUUID} from 'node:crypto'
import householdAuth from '../lib/household-auth.cjs'
import {PROJECT_IMAGE_STORE,PROJECT_IMAGE_JOBS,projectImageStore,readImageProject,canGenerateProjectImage,validProjectImageId,projectImageJobKey,projectImageAssetKey,projectImageHash,projectImageStatus} from '../lib/project-image.mjs'
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}})

export function createProjectImagesHandler({authenticate=householdAuth.readSession,readProject=readImageProject,authorize=canGenerateProjectImage,jobs=null,images=null,dispatch=fetch,now=()=>new Date(),createId=randomUUID}={}){
 return async request=>{try{
  if(!['GET','POST'].includes(request.method))return json(405,{error:'Method not allowed.'})
  const session=await authenticate({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
  if(!session)return json(401,{error:'Sign in to view project images.'})
  const url=new URL(request.url),body=request.method==='POST'?await request.json().catch(()=>({})):Object.fromEntries(url.searchParams)
  if(!validProjectImageId(body.projectId))return json(400,{error:'Choose a saved project.'})
  const project=await readProject(body.projectId)
  if(!project)return json(404,{error:'This project no longer exists.'})
  const store=jobs||projectImageStore(PROJECT_IMAGE_JOBS),key=projectImageJobKey(project.id)
  const entry=await store.getWithMetadata(key,{type:'json'}),current=entry?.data,status=projectImageStatus(project,current,now())
  if(request.method==='GET'){
   if(body.assetId){
    if(status.state!=='ready'||!validProjectImageId(body.assetId)||current.assetId!==body.assetId)return json(404,{error:'Project image not found.'})
    const bytes=await (images||projectImageStore(PROJECT_IMAGE_STORE)).get(projectImageAssetKey(body.assetId),{type:'arrayBuffer'})
    if(!bytes)return json(404,{error:'Project image not found.'})
    return new Response(bytes,{headers:{'content-type':'image/png','cache-control':'private, no-store'}})
   }
   return json(200,status)
  }
  if(!await authorize(session,project))return json(403,{error:'You cannot generate imagery for this project.'})
  if(['not-needed','uploaded','ready','queued','generating'].includes(status.state)||status.state==='error'&&!body.retry)return json(200,status)
  if(entry?.data&&!entry.etag)return json(409,{error:'Refresh before retrying the project image.'})
  const job={id:createId(),assetId:createId(),projectId:project.id,sourceHash:projectImageHash(project),state:'queued',requestedBy:session.member,createdAt:now().toISOString()}
  const claim=await store.setJSON(key,job,entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true})
  if(claim?.modified===false)return json(202,projectImageStatus(project,await store.get(key,{type:'json'}),now()))
  try{
   const response=await dispatch(new URL('/.netlify/functions/project-image-generate-background',url).href,{method:'POST',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/json',cookie:request.headers.get('cookie')||''},body:JSON.stringify({projectId:project.id,jobId:job.id})})
   if(!response.ok)throw new Error('The image could not be queued.')
  }catch{
   const latest=await store.getWithMetadata(key,{type:'json'})
   if(latest?.data?.id===job.id&&latest.data.state==='queued')await store.setJSON(key,{...job,state:'error',error:'The image could not be queued. Retry image.',updatedAt:now().toISOString()},{onlyIfMatch:latest.etag})
   return json(200,projectImageStatus(project,(await store.get(key,{type:'json'})),now()))
  }
  return json(202,projectImageStatus(project,job,now()))
 }catch(error){console.error('[project-images]',error);return json(500,{error:'Project imagery is temporarily unavailable. Your project is saved.'})}}
}
export default createProjectImagesHandler()
export const config={path:'/.netlify/functions/project-images'}
