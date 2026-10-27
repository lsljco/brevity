import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {PROJECT_IMAGE_STORE,PROJECT_IMAGE_JOBS,projectImageStore,readImageProject,canGenerateProjectImage,validProjectImageId,projectImageJobKey,projectImageHash,generateProjectImage} from '../lib/project-image.mjs'
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})
export function createProjectImageBackgroundHandler({authenticate=householdAuth.readSession,readProject=readImageProject,authorize=canGenerateProjectImage,jobs=null,images=null,generate=generateProjectImage,now=()=>new Date()}={}){
 return async request=>{
  if(request.method!=='POST')return json(405,{error:'Method not allowed.'})
  const session=await authenticate({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
  if(!session)return json(401,{error:'Sign in to generate project imagery.'})
  const body=await request.json().catch(()=>({}))
  if(!validProjectImageId(body.projectId)||!validProjectImageId(body.jobId))return json(400,{error:'Invalid project image job.'})
  const store=jobs||projectImageStore(PROJECT_IMAGE_JOBS),key=projectImageJobKey(body.projectId)
  const entry=await store.getWithMetadata(key,{type:'json'}),job=entry?.data
  if(!job||job.id!==body.jobId||job.state!=='queued'||!entry.etag)return json(202,{accepted:true})
  if(job.requestedBy!==session.member)return json(403,{error:'This image job belongs to another member.'})
  const project=await readProject(body.projectId)
  const finish=async patch=>{const latest=await store.getWithMetadata(key,{type:'json'});if(latest?.data?.id===job.id&&latest.etag)await store.setJSON(key,{...latest.data,...patch,updatedAt:now().toISOString()},{onlyIfMatch:latest.etag})}
  if(!project||!project.autoImageEnabled||project.photos?.length||projectImageHash(project)!==job.sourceHash){await finish({state:'obsolete',error:'Project changed or was removed.'});return json(202,{accepted:true})}
  if(!await authorize(session,project)){await finish({state:'error',error:'Project image permission changed.'});return json(403,{error:'Project image permission changed.'})}
  const claim=await store.setJSON(key,{...job,state:'generating',updatedAt:now().toISOString()},{onlyIfMatch:entry.etag})
  if(claim?.modified===false)return json(202,{accepted:true})
  try{
   await generate({project,assetId:job.assetId,store:images||projectImageStore(PROJECT_IMAGE_STORE)})
   const latestProject=await readProject(project.id)
   if(!latestProject||latestProject.photos?.length||projectImageHash(latestProject)!==job.sourceHash){await finish({state:'obsolete',error:'Project changed while its image was generated.'});return json(202,{accepted:true})}
   await finish({state:'ready'})
  }catch(error){console.error('[project-image-background]',error);await finish({state:'error',error:'The image could not be generated. Your project is saved. Retry image.'})}
  return json(202,{accepted:true})
 }
}
export default createProjectImageBackgroundHandler()
export const config={background:true,path:'/.netlify/functions/project-image-generate-background'}
