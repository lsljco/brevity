import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {productionAssistantActionRepository} from '../lib/assistant-action-repository.mjs'
import {createFinancePacketService} from '../lib/finance-packet-service.mjs'

const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}})
export function createFinancePacketHandler({authenticate=householdAuth.readSession,permissions=()=>productionAssistantActionRepository().getPermissions(),prepare=createFinancePacketService()}={}){
  return async request=>{
    if(request.method!=='POST')return json(405,{error:'Method not allowed.'})
    const session=await authenticate({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
    if(!session)return json(401,{error:'Sign in to read financial meeting analysis.'})
    try{
      if(session.role!=='admin'&&(await permissions())?.[session.member]?.finance!==true)return json(403,{error:'Financial reporting access is required.'})
      const body=await request.json()
      if(body.accountIds!==undefined&&(!Array.isArray(body.accountIds)||body.accountIds.length>200||body.accountIds.some(id=>typeof id!=='string')))return json(400,{error:'Invalid selected account scope.'})
      return json(200,await prepare({cadence:body.cadence,mode:body.mode,accountIds:body.accountIds}))
    }catch{return json(503,{error:'Automatic report analysis is temporarily unavailable. Calculated insights remain visible.'})}
  }
}
export default createFinancePacketHandler()
