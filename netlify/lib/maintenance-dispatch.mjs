import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto'
import build from './release-build-context.mjs'
const signature=(body,time,key)=>createHmac('sha256',key).update(`${time}\n${body}`).digest('hex')
export function verifyMaintenanceRequest({body,time,proof,key,now=Date.now()}){
 if(!key||!/^\d{13}$/.test(time||'')||Math.abs(now-Number(time))>120000||!/^[a-f0-9]{64}$/.test(proof||''))return false
 return timingSafeEqual(Buffer.from(signature(body,time,key),'hex'),Buffer.from(proof,'hex'))
}
export async function dispatchMaintenance(job,{origin=build.origin,key=process.env.NETLIFY_TOKEN,fetcher=globalThis.fetch}={}){
 if(!['backup','retention'].includes(job)||!key)throw Error('Maintenance dispatch is not configured.')
 const url=new URL('/.netlify/functions/brevity-maintenance-background',origin)
 if(url.protocol!=='https:'||!url.hostname.endsWith('.netlify.app'))throw Error('Maintenance requires the trusted Netlify deploy origin.')
 const body=JSON.stringify({id:randomUUID(),job}),time=String(Date.now())
 const result=await fetcher(url,{method:'POST',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json','x-brevity-time':time,'x-brevity-proof':signature(body,time,key)},body})
 if(result.status!==202)throw Error(`Maintenance dispatch rejected (${result.status}).`)
 console.info('[brevity-maintenance-dispatch]',JSON.stringify({id:JSON.parse(body).id,job,state:'dispatched',origin:url.origin,commit:build.commit}))
}
