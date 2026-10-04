import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {calculateMealNutrition,normalizeNutritionRequest} from '../lib/meal-nutrition.mjs'
import {nutritionJobId,nutritionJobKey,nutritionJobStore,jobJson} from '../lib/meal-nutrition-jobs.mjs'

export function createNutritionBackgroundHandler({readSession=householdAuth.readSession,store=null,calculate=calculateMealNutrition,now=Date.now}={}){
  return async request=>{
    if(request.method!=='POST')return jobJson(405,{error:'Method not allowed.'})
    const session=await readSession({headers:{cookie:request.headers.get('cookie')||''}})
    if(!session?.member)return jobJson(401,{error:'Sign in to calculate nutrition.'})
    const body=await request.json().catch(()=>({})),jobId=nutritionJobId(body.jobId)
    if(!jobId)return jobJson(400,{error:'A valid nutrition job is required.'})
    const jobs=store||nutritionJobStore(),key=nutritionJobKey(session.member,jobId)
    // Netlify may retry background delivery. Claim once to avoid duplicate model calls.
    const claim=await jobs.setJSON(key,{state:'calculating',createdAt:now()},{onlyIfNew:true})
    if(claim?.modified===false)return jobJson(202,{accepted:true})
    try{
      const input=normalizeNutritionRequest(body)
      const nutrition=await calculate(input,{timeoutMs:150000})
      await jobs.setJSON(key,{state:'ready',nutrition,createdAt:now()})
    }catch(error){
      await jobs.setJSON(key,{state:'error',error:error.message||'Nutrition calculation failed. Your recipe is still here; please try again.',createdAt:now()})
    }
    return jobJson(202,{accepted:true})
  }
}
export default createNutritionBackgroundHandler()
export const config={background:true,path:'/.netlify/functions/meal-nutrition-background'}
