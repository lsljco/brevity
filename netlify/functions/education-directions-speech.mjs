import householdAuth from './household-auth.js'
import { getStore } from '@netlify/blobs'

const { readSession }=householdAuth
const MODEL=process.env.BREVITY_TTS_MODEL||'gpt-4o-mini-tts'
const VOICE=process.env.BREVITY_TTS_VOICE||'alloy'
const HOUSEHOLD_ID=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
const STORE_NAME='brevity-ai-tutor'
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)})
const store=()=>getStore({name:STORE_NAME,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})

export const handler=async event=>{
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  const session=await readSession(event)
  if(!session)return json(401,{error:'Sign in required.'})
  if(!process.env.OPENAI_API_KEY)return json(503,{error:'Brevity AI is not configured.'})
  let body={}
  try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request.'})}
  const exerciseId=String(body.exerciseId||'')
  if(!/^reading-[a-z0-9-]+$/i.test(exerciseId))return json(400,{error:'Choose a valid exercise.'})
  const record=await store().get(`${HOUSEHOLD_ID}/education/exercises/${exerciseId}`,{type:'json'}).catch(()=>null)
  if(!record?.directions)return json(404,{error:'Directions are unavailable for this exercise.'})
  try{
    const response=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:MODEL,voice:VOICE,input:record.directions,response_format:'mp3',instructions:'Read these Grade 3 exercise directions clearly, warmly, and at a moderate pace. Do not add or omit instructions.'})})
    if(!response.ok)return json(502,{error:'Brevity could not read the directions aloud.'})
    const audio=Buffer.from(await response.arrayBuffer()).toString('base64')
    return json(200,{audioBase64:audio,mimeType:'audio/mpeg',model:MODEL,voice:VOICE,text:record.directions})
  }catch(error){console.error('[education-directions-speech]',error);return json(502,{error:'Brevity could not read the directions aloud.'})}
}
