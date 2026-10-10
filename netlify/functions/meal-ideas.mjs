import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {ideaJobId,ideaKey,ideaStore,ideaJson} from '../lib/meal-ideas.mjs'
export function createMealIdeasStatusHandler({readSession=householdAuth.readSession,store=null,now=Date.now}={}){
 return async request=>{
  if(request.method!=='GET')return ideaJson(405,{error:'Method not allowed.'})
  const session=await readSession({headers:{cookie:request.headers.get('cookie')||''}})
  if(!session?.member)return ideaJson(401,{error:'Sign in to view meal ideas.'})
  const id=ideaJobId(new URL(request.url).searchParams.get('jobId'))
  if(!id)return ideaJson(400,{error:'A valid meal-ideas request is required.'})
  const job=await(store||ideaStore()).get(ideaKey(session.member,id),{type:'json'})
  if(job&&now()-job.createdAt>86400000)return ideaJson(200,{state:'error',error:'These suggestions have expired. Discover a fresh set of meals.'})
  if(job&&['creating','illustrating'].includes(job.state)&&now()-job.createdAt>15*60000)return ideaJson(200,{...job,state:'ready',error:'Image generation timed out. Recipes remain available; save a meal to retry its photo.'})
  return ideaJson(200,job||{state:'pending'})
 }
}
export default createMealIdeasStatusHandler()
export const config={path:'/.netlify/functions/meal-ideas'}
