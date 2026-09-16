import householdAuth from './household-auth.js'
import { scoreReadingTranscript } from '../../src/education/readingFluency.js'

const { readSession }=householdAuth
const TRANSCRIBE_MODEL=process.env.BREVITY_TRANSCRIBE_MODEL||'gpt-transcribe'
const MAX_AUDIO_BASE64=8_000_000
const MAX_REFERENCE_CHARS=12_000
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)})
const audioType=value=>['audio/webm','audio/webm;codecs=opus','audio/mp4','audio/ogg','audio/wav','audio/mpeg'].includes(String(value||'').toLowerCase())?String(value).toLowerCase():'audio/webm'
const extensionFor=type=>type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':type.includes('wav')?'wav':type.includes('mpeg')?'mp3':'webm'

export const educationReadingGradeInternals={scoreReadingTranscript,audioType,extensionFor,MAX_AUDIO_BASE64,MAX_REFERENCE_CHARS}

export const handler=async event=>{
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  const session=await readSession(event)
  if(!session)return json(401,{error:'Sign in required.'})
  if(!process.env.OPENAI_API_KEY)return json(503,{error:'Brevity AI is not configured.'})
  let body={}
  try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request.'})}
  const referenceText=String(body.referenceText||'').trim()
  const audioBase64=String(body.audioBase64||'')
  const elapsedSeconds=Math.max(1,Math.min(180,Number(body.elapsedSeconds)||60))
  if(!referenceText||referenceText.length>MAX_REFERENCE_CHARS)return json(400,{error:'A bounded reference passage is required.'})
  if(!audioBase64||audioBase64.length>MAX_AUDIO_BASE64||!/^[A-Za-z0-9+/=\r\n]+$/.test(audioBase64))return json(400,{error:'A bounded audio recording is required.'})
  const mimeType=audioType(body.mimeType)
  try{
    const bytes=Buffer.from(audioBase64.replace(/\s/g,''),'base64')
    if(!bytes.length)return json(400,{error:'The audio recording was empty.'})
    const form=new FormData()
    form.append('model',TRANSCRIBE_MODEL)
    form.append('file',new Blob([bytes],{type:mimeType}),`isaiah-reading.${extensionFor(mimeType)}`)
    form.append('response_format','json')
    form.append('prompt','A third-grade student is reading the exact passage supplied by Brevity. Preserve spoken words faithfully, including repetitions and self-corrections when possible.')
    const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form})
    const payload=await response.json().catch(()=>({}))
    if(!response.ok||typeof payload.text!=='string'){
      console.error('[education-reading-grade] transcription failed',response.status,payload?.error?.type||'unknown')
      return json(502,{error:'Brevity could not transcribe this reading sample. The adult may use the manual fluency entry instead.'})
    }
    const transcript=payload.text.trim()
    const score=scoreReadingTranscript({referenceText,transcript,elapsedSeconds})
    return json(200,{transcript,score,transcriptionModel:TRANSCRIBE_MODEL,rawAudioRetained:false,reviewed:false,evidenceStatus:'draft-adult-review-required',note:'Speech recognition can introduce transcription errors. Review the transcript and flagged word differences before accepting this as mastery evidence.'})
  }catch(error){
    console.error('[education-reading-grade]',error)
    return json(502,{error:'Brevity could not grade this reading sample.'})
  }
}
