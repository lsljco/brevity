import householdAuth from './household-auth.js'
import {productionConversationRepository} from '../lib/assistant-conversation-store.mjs'
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)})
export const createConversationHandler=({readSession=householdAuth.readSession,repository=productionConversationRepository}={})=>async event=>{
  const session=await readSession(event).catch(()=>null)
  if(!session)return json(401,{error:'Sign in to use your conversation.'})
  try{
    const repo=repository()
    if(event.httpMethod==='GET')return json(200,await repo.read(session.member))
    if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
    const body=JSON.parse(event.body||'{}')
    if(!['clear','restore'].includes(body.action))return json(400,{error:'Choose clear or restore.'})
    return json(200,await repo[body.action](session.member,body.version))
  }catch(error){return json(error.status||400,{error:error.message})}
}
export const handler=createConversationHandler()
