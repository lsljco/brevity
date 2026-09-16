import { randomUUID } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'
import { productionMealPlanRepository } from '../lib/meal-plan-store.mjs'
import { generateMealImage, mealImageJobKey, MEAL_IMAGE_JOB_STORE, MEAL_IMAGE_STORE } from '../lib/meal-image.mjs'

const { readSession } = householdAuth
const householdId=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})
const safe=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,180)

export function createMealImageBackgroundHandler({readSessionFn=readSession,repository=null,imageStore=null,jobStore=null,generateImage=generateMealImage,now=()=>new Date()}={}){
  return async request=>{
    if(request.method!=='POST')return json(405,{error:'Method not allowed.'})
    const session=await readSessionFn({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
    if(!session)return json(401,{error:'Sign in to generate a meal image.'})
    const body=await request.json().catch(()=>({})),jobId=safe(body.jobId),mealId=safe(body.mealId)
    if(!jobId||!mealId)return json(400,{error:'A valid meal-image job and meal are required.'})
    const jobs=jobStore||getStore({name:MEAL_IMAGE_JOB_STORE,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
    const images=imageStore||getStore({name:MEAL_IMAGE_STORE,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
    const key=mealImageJobKey(householdId,jobId)
    try{
      const meals=repository||await productionMealPlanRepository()
      const library=await meals.getLibrary(),meal=library.library.find(candidate=>candidate.id===mealId)
      if(!meal)throw Object.assign(new Error('That meal is no longer in the household library.'),{code:'VALIDATION_ERROR'})
      await jobs.setJSON(key,{state:'generating',jobId,mealId,startedAt:now().toISOString(),startedBy:session.member||'Household member'})
      const assetId=`${meal.id}-${randomUUID()}`
      const image=await generateImage({meal:{...meal,image:''},assetId,householdId,store:images})
      await meals.setMealImage({mealId:meal.id,image,actor:session.member||'Household member'})
      await jobs.setJSON(key,{state:'ready',jobId,mealId,meal:{...meal,image,imageGenerated:true},updatedAt:now().toISOString()})
    }catch(error){
      console.error('[meal-image-generate-background]',error)
      await jobs.setJSON(key,{state:'error',jobId,mealId,error:error.message||'Brevity could not generate the meal image.',updatedAt:now().toISOString()}).catch(()=>{})
    }
    return json(202,{accepted:true,jobId})
  }
}

export default createMealImageBackgroundHandler()
export const config={background:true,path:'/.netlify/functions/meal-image-generate-background'}
