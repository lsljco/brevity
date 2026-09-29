import {withLambda} from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {createProductionActionResources} from '../lib/assistant-action-executor.mjs'
import {MODULE_RESOURCE,resolveModules} from '../../src/modules/configuration.js'
export const handler=async event=>{
 const session=await householdAuth.readSession(event).catch(()=>null)
 const respond=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)})
 if(!session)return respond(401,{error:'Sign in to view household modules.'})
 if(event.httpMethod!=='GET')return respond(405,{error:'Module changes require Action Mode.'})
 try{const entry=await createProductionActionResources().read(MODULE_RESOURCE);return respond(200,{modules:resolveModules(entry.value),configuration:entry.value,version:entry.version})}catch{return respond(503,{error:'Module configuration is temporarily unavailable.'})}
}

export default withLambda(handler)
