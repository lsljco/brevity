import {createHmac} from 'node:crypto'
import {SignJWT,jwtVerify} from 'jose'

export const EXECUTIVE_STAGES=['cfo','reviewer','coo','bruce']
const fail=()=>{throw Object.assign(Error('Executive worker identity is invalid or revoked.'),{status:403})}
function key(secret,role,epoch){
 if(typeof secret!=='string'||secret.length<32)throw Error('Executive signing configuration is unavailable.')
 if(!EXECUTIVE_STAGES.includes(role)||!Number.isInteger(epoch)||epoch<1)fail()
 return createHmac('sha256',secret).update(`brevity-executive:${role}:${epoch}`).digest()
}
// Credentials are short-lived, role/run/household-bound and never sent to the UI,
// model, logs or persistent store. Rotating the configuration epoch revokes them.
export async function issueExecutiveIdentity({secret,role,epoch,runId,household,now=new Date()}){
 return new SignJWT({role,epoch,runId,household}).setProtectedHeader({alg:'HS256'})
  .setIssuer('brevity-executive-runtime').setAudience('brevity-executive-stage')
  .setSubject(`executive:${role}`).setIssuedAt(Math.floor(+now/1000)).setExpirationTime(Math.floor(+now/1000)+240)
  .sign(key(secret,role,epoch))
}
export async function verifyExecutiveIdentity(token,{secret,role,epoch,runId,household,now=new Date()}){
 try{
  const {payload}=await jwtVerify(token,key(secret,role,epoch),{algorithms:['HS256'],issuer:'brevity-executive-runtime',audience:'brevity-executive-stage',currentDate:now,maxTokenAge:'4m'})
  if(payload.role!==role||payload.epoch!==epoch||payload.runId!==runId||payload.household!==household||payload.sub!==`executive:${role}`)fail()
  return {id:payload.sub,role,runId,household,epoch}
 }catch{fail()}
}
