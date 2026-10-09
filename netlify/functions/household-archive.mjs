import '../lib/native-runtime.mjs'
import {withLambda} from '@netlify/aws-lambda-compat'
import householdAuth from '../lib/household-auth.cjs'
import {productionHouseholdArchive} from '../lib/household-archive.mjs'
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'private, no-store'},body:JSON.stringify(body)})
export function createArchiveHandler({authenticate=householdAuth.readSession,repository=productionHouseholdArchive}={}){return async event=>{
 const session=await authenticate(event).catch(()=>null);if(!session)return json(401,{error:'Sign in to view household history.'})
 try{
  const repo=repository()
  if(event.httpMethod==='GET')return json(200,await repo.search(event.queryStringParameters||{},session))
  if(event.httpMethod==='POST'){
   const body=JSON.parse(event.body||'{}')
   if(body.action==='pin')return json(200,await repo.pin(body.date,body.pinned,session))
   if(body.action==='capture'){if(session.role!=='admin')return json(403,{error:'Administrator access is required.'});return json(200,await repo.capture())}
  }
  return json(405,{error:'Unsupported archive action.'})
 }catch(error){return json(error.status||400,{error:error.message||'History is unavailable. Retry shortly.'})}
}}
export const lambdaHandler=createArchiveHandler()
export default withLambda(lambdaHandler)
