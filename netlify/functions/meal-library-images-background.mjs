import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {libraryImageBatch} from '../lib/meal-library-images-production.mjs'
export default async function handler(request){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405})
 const automated=process.env.BREVITY_AUTOMATION_KEY&&request.headers.get('x-brevity-automation-key')===process.env.BREVITY_AUTOMATION_KEY
 const session=automated||await householdAuth.readSession({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
 if(!session)return new Response('Unauthorized',{status:401})
 await (await libraryImageBatch()).run()
 return new Response(null,{status:202})
}
export const config={background:true,path:'/.netlify/functions/meal-library-images-background'}
