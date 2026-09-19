import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'
import { FITNESS_IMAGE_JOB_STORE, FITNESS_IMAGE_STORE, fitnessImageJobKey, generateFitnessImage, validateFitnessImageRequest } from '../lib/fitness-image.mjs'

const {readSession}=householdAuth
const householdId=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
const safe=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,180)
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})

export function createFitnessImageBackgroundHandler({readSessionFn=readSession,imageStore=null,jobStore=null,generateImage=generateFitnessImage,now=()=>new Date()}={}){
  return async request=>{
    if(request.method!=='POST')return json(405,{error:'Method not allowed.'})
    const session=await readSessionFn({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
    if(!session)return json(401,{error:'Sign in to create household workout images.'})
    const body=await request.json().catch(()=>({})),jobId=safe(body.jobId)
    if(!jobId)return json(400,{error:'A valid fitness-image job is required.'})
    let requestData
    try{requestData=validateFitnessImageRequest(body.member,body.exerciseIds)}catch(error){return json(400,{error:error.message})}
    const jobs=jobStore||getStore({name:FITNESS_IMAGE_JOB_STORE,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
    const images=imageStore||getStore({name:FITNESS_IMAGE_STORE,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
    const key=fitnessImageJobKey(householdId,jobId),completed=[]
    try{
      await jobs.setJSON(key,{state:'generating',jobId,...requestData,completed,total:requestData.exerciseIds.length,startedAt:now().toISOString(),startedBy:session.member})
      for(const exerciseId of requestData.exerciseIds){
        const image=await generateImage({member:requestData.member,exerciseId,householdId,store:images})
        completed.push({exerciseId,image})
        await jobs.setJSON(key,{state:'generating',jobId,...requestData,completed,total:requestData.exerciseIds.length,updatedAt:now().toISOString()})
      }
      await jobs.setJSON(key,{state:'ready',jobId,...requestData,completed,total:requestData.exerciseIds.length,updatedAt:now().toISOString()})
    }catch(error){
      console.error('[fitness-image-generate-background]',error)
      await jobs.setJSON(key,{state:'error',jobId,...requestData,completed,total:requestData.exerciseIds.length,error:error.message||'Brevity could not create the workout images.',updatedAt:now().toISOString()}).catch(()=>{})
    }
    return json(202,{accepted:true,jobId})
  }
}

export default createFitnessImageBackgroundHandler()
export const config={background:true,path:'/.netlify/functions/fitness-image-generate-background'}
