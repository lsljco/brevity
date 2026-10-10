import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {getStore} from '../lib/scoped-store.mjs'
import {generateMealImage,MEAL_IMAGE_STORE} from '../lib/meal-image.mjs'
import {generateIdeas,normalizeIdeaRequest,ideaJobId,ideaKey,ideaStore,ideaJson} from '../lib/meal-ideas.mjs'
export function createMealIdeasHandler({readSession=householdAuth.readSession,store=null,imageStore=null,generate=generateIdeas,generateImage=generateMealImage,now=Date.now}={}){
 return async request=>{
  if(request.method!=='POST')return ideaJson(405,{error:'Method not allowed.'})
  const session=await readSession({headers:{cookie:request.headers.get('cookie')||''}})
  if(!session?.member)return ideaJson(401,{error:'Sign in to discover meals.'})
  const body=await request.json().catch(()=>({})),id=ideaJobId(body.jobId)
  if(!id)return ideaJson(400,{error:'A valid meal-ideas request is required.'})
  const jobs=store||ideaStore(),key=ideaKey(session.member,id),createdAt=now()
  const claim=await jobs.setJSON(key,{state:'creating',createdAt},{onlyIfNew:true})
  if(claim?.modified===false)return ideaJson(202,{accepted:true})
  try{
   const input=normalizeIdeaRequest(body),ideas=await generate(input)
   // Publish recipes before generating images so users can compare immediately.
   await jobs.setJSON(key,{state:'illustrating',createdAt,input,ideas})
   const images=imageStore||getStore({name:MEAL_IMAGE_STORE,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
   // Two images at a time, bounded to six. Persist a whole completed pair to avoid stale concurrent writes.
   for(let offset=0;offset<ideas.length;offset+=2){
    await Promise.all(ideas.slice(offset,offset+2).map(async meal=>{
     try{meal.image=await generateImage({meal,assetId:`discovery-${id}-${meal.id}`,householdId:process.env.BREVITY_HOUSEHOLD_ID||'lslj-family',store:images});meal.imageState='ready'}catch{meal.imageState='error'}
    }))
    await jobs.setJSON(key,{state:offset+2>=ideas.length?'ready':'illustrating',createdAt,input,ideas})
   }
  }catch(error){await jobs.setJSON(key,{state:'error',createdAt,error:error.message||'Could not prepare meal ideas. Please try again.'})}
  return ideaJson(202,{accepted:true})
 }
}
export default createMealIdeasHandler()
export const config={background:true,path:'/.netlify/functions/meal-ideas-background'}
