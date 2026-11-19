import '../lib/native-runtime.mjs'
import {automationAuthorized,executeExecutiveCycle} from '../lib/executive-runs.mjs'
export default async function handler(request){
 if(request.method!=='POST'||!automationAuthorized(request.headers.get('x-brevity-automation-key')))return new Response('Unauthorized',{status:401})
 let body;try{body=await request.json()}catch{return new Response('Invalid request',{status:400})}
 if(typeof body?.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(body.id))return new Response('Invalid cycle ID',{status:400})
 try{await executeExecutiveCycle(body.id);return new Response(null,{status:204})}
 catch{console.error('[executive-cycle] execution stopped; inspect the private cycle record');return new Response('Cycle stopped',{status:503})}
}
export const config={background:true,path:'/.netlify/functions/executive-cycle-background'}
