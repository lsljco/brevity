import '../lib/native-runtime.mjs'
import {timingSafeEqual} from 'node:crypto'
import {createFinancePacketService} from '../lib/finance-packet-service.mjs'

export function automationAuthorized(supplied,expected){
  const a=Buffer.from(String(supplied||'')),b=Buffer.from(String(expected||''))
  return a.length>0&&a.length===b.length&&timingSafeEqual(a,b)
}
export function createPacketBackgroundHandler({prepare=createFinancePacketService(),secret=()=>process.env.BREVITY_AUTOMATION_KEY}={}){
  return async request=>{
    if(request.method!=='POST')return new Response('Method not allowed',{status:405})
    if(!automationAuthorized(request.headers.get('x-brevity-automation-key'),secret()))return new Response('Unauthorized',{status:401})
    for(const cadence of ['daily','weekly','monthly','quarterly','yearly'])for(const mode of ['current','previous'])await prepare({cadence,mode})
    return new Response(JSON.stringify({prepared:10,authority:'analysis-only'}),{headers:{'content-type':'application/json'}})
  }
}
export default createPacketBackgroundHandler()
export const config={background:true}
