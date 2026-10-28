import '../lib/native-runtime.mjs'
import {decodeProtectedHeader,importJWK,jwtVerify} from 'jose'
import {createHash,timingSafeEqual} from 'node:crypto'
import {bankClient,dispatchBankSync} from '../lib/bank-background-sync.mjs'
import storage from '../legacy-functions/storage.js'
import {preview} from '../lib/scoped-store.mjs'
export async function verifyPlaidWebhook(raw,jwt,{client=bankClient(),now=new Date()}={}){
 if(!jwt||jwt.length>8000)throw Error('Invalid webhook signature.')
 const header=decodeProtectedHeader(jwt)
 if(header.alg!=='ES256'||typeof header.kid!=='string'||header.kid.length>200)throw Error('Invalid webhook key.')
 const response=await client.webhookVerificationKeyGet({key_id:header.kid},{timeout:8000}),jwk=response.data.key
 if(jwk.expired_at!=null||jwk.alg!=='ES256'||jwk.kid!==header.kid)throw Error('Webhook key unavailable.')
 const key=await importJWK(jwk,'ES256')
 const {payload}=await jwtVerify(jwt,key,{algorithms:['ES256'],maxTokenAge:'5m',clockTolerance:5,currentDate:now})
 const expected=createHash('sha256').update(raw).digest('hex'),actual=String(payload.request_body_sha256||'')
 if(!/^[a-f0-9]{64}$/.test(actual)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))throw Error('Webhook body mismatch.')
 return JSON.parse(raw)
}
export function createPlaidWebhookHandler({verify=verifyPlaidWebhook,dispatch=dispatchBankSync,getTokens=storage.getTokens,isPreview=preview}={}){
 return async request=>{
  if(request.method!=='POST')return new Response('Method not allowed',{status:405})
  if(isPreview)return new Response('Preview disabled',{status:403})
  const raw=await request.text()
  if(Buffer.byteLength(raw)>256000)return new Response('Too large',{status:413})
  let event
  try{event=await verify(raw,request.headers.get('plaid-verification'))}catch{return new Response('Invalid signature',{status:401})}
  if(!((event.webhook_type==='TRANSACTIONS'&&event.webhook_code==='SYNC_UPDATES_AVAILABLE')||(event.webhook_type==='ITEM'&&['ERROR','LOGIN_REPAIRED'].includes(event.webhook_code))))return new Response(null,{status:200})
  try{
   if(!(await getTokens({})||[]).some(t=>t.item_id===event.item_id))return new Response(null,{status:200})
   await dispatch()
   return new Response(null,{status:200})
  }catch{return new Response('Please retry',{status:503})}
 }
}
export default createPlaidWebhookHandler()
