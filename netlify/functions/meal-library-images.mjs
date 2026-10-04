import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {libraryImageBatch} from '../lib/meal-library-images-production.mjs'
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})
export default async function handler(request){
 const session=await householdAuth.readSession({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
 if(!session)return json(401,{error:'Sign in to manage meal images.'})
 if(!['GET','POST'].includes(request.method))return json(405,{error:'Method not allowed.'})
 try{const batch=await libraryImageBatch()
  if(request.method==='GET')return json(200,await batch.status())
  const result=await batch.start(session.member||'Household member')
  const headers={'content-type':'application/json',...(process.env.BREVITY_AUTOMATION_KEY?{'x-brevity-automation-key':process.env.BREVITY_AUTOMATION_KEY}:{cookie:request.headers.get('cookie')||''})}
  await fetch('https://brevityoflife.netlify.app/.netlify/functions/meal-library-images-background',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(10000)}).catch(()=>null)
  return json(202,result)
 }catch(error){return json(500,{error:error.message})}
}
export const config={path:'/.netlify/functions/meal-library-images'}
