import '../lib/native-runtime.mjs'
import {timingSafeEqual} from 'node:crypto'
const automationAuthorized=(supplied,expected)=>{const a=Buffer.from(String(supplied||'')),b=Buffer.from(String(expected||''));return a.length>0&&a.length===b.length&&timingSafeEqual(a,b)}
import {createBankBackgroundSync} from '../lib/bank-background-sync.mjs'
export function createBankSyncHandler({run=createBankBackgroundSync(),secret=()=>process.env.BREVITY_AUTOMATION_KEY}={}){
 return async request=>{
  if(request.method!=='POST')return new Response('Method not allowed',{status:405})
  if(!automationAuthorized(request.headers.get('x-brevity-automation-key'),secret()))return new Response('Unauthorized',{status:401})
  await run()
  return new Response(null,{status:202})
 }
}
export default createBankSyncHandler()
export const config={background:true}
