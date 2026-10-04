import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {nutritionJobId,nutritionJobKey,nutritionJobStore,jobJson} from '../lib/meal-nutrition-jobs.mjs'
export function createNutritionStatusHandler({readSession=householdAuth.readSession,store=null,now=Date.now}={}){
  return async request=>{
    if(request.method!=='GET')return jobJson(405,{error:'Method not allowed.'})
    const session=await readSession({headers:{cookie:request.headers.get('cookie')||''}})
    if(!session?.member)return jobJson(401,{error:'Sign in to check nutrition.'})
    const jobId=nutritionJobId(new URL(request.url).searchParams.get('jobId'))
    if(!jobId)return jobJson(400,{error:'A valid nutrition job is required.'})
    const job=await (store||nutritionJobStore()).get(nutritionJobKey(session.member,jobId),{type:'json'})
    if(job&&now()-job.createdAt>10*60*1000)return jobJson(200,{state:'error',error:'This calculation expired. Your recipe is still here; calculate again.'})
    return jobJson(200,job||{state:'pending'})
  }
}
export default createNutritionStatusHandler()
export const config={path:'/.netlify/functions/meal-nutrition-job-status'}
