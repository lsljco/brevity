import { getStore } from '@netlify/blobs'
import { handler as generateSermonFormation } from './sermon-formation.mjs'

const HOUSEHOLD_ID=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
const STORE_NAME='brevity-household'
const ACTIVE_SERMON_KEY=`${HOUSEHOLD_ID}/spiritual/active-sermon`
const store=()=>getStore({name:STORE_NAME,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const jobKey=id=>`${HOUSEHOLD_ID}/sermon-jobs/${id}`

const sharedText=value=>typeof value==='string'?value
  .replace(/Lorenzo owns this pillar and must lead the household/gi,'This devotion belongs to every household member')
  .replace(/Lorenzo must/gi,'Each household member should')
  .replace(/Lorenzo leads?/gi,'the household practices')
  .replace(/Lorenzo/gi,'each household member'):value
const sharedValue=value=>Array.isArray(value)?value.map(sharedValue):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sharedValue(item)])):sharedText(value)

export default async function handler(request){
  let body={}
  try{body=await request.json()}catch{return}
  const jobId=String(body.jobId||'')
  if(!/^[a-zA-Z0-9-]{20,80}$/.test(jobId))return
  const dataStore=store()
  await dataStore.setJSON(jobKey(jobId),{state:'processing',updatedAt:new Date().toISOString()})
  try{
    const result=await generateSermonFormation({httpMethod:'POST',headers:{cookie:request.headers.get('cookie')||''},body:JSON.stringify(body.request||{})})
    const rawPayload=JSON.parse(result.body||'{}')
    if(result.statusCode!==200)throw new Error(rawPayload.error||`Brevity sermon analysis returned ${result.statusCode}.`)
    const payload=sharedValue(rawPayload)
    const active=await dataStore.get(ACTIVE_SERMON_KEY,{type:'json'}).catch(()=>null)
    if(active)await dataStore.setJSON(ACTIVE_SERMON_KEY,sharedValue({...active,sermonNotes:payload.sermonNotes||active.sermonNotes}))
    await dataStore.setJSON(jobKey(jobId),{state:'ready',result:payload,updatedAt:new Date().toISOString()})
  }catch(error){
    console.error('[sermon-formation-background]',error)
    await dataStore.setJSON(jobKey(jobId),{state:'error',error:error.message||'Background sermon analysis failed.',updatedAt:new Date().toISOString()})
  }
}

export const config={background:true,path:'/.netlify/functions/sermon-formation-background'}
