import mammoth from 'mammoth'
import pdf from 'pdf-parse'
import householdAuth from './household-auth.js'

const {readSession}=householdAuth
const MAX_FILE_BYTES=4_500_000
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)})
const clean=text=>String(text||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{4,}/g,'\n\n\n').trim()

export const handler=async event=>{
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  const session=await readSession(event).catch(()=>null)
  if(!session)return json(401,{error:'Sign in to import sermon notes.'})
  let body={}
  try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid document upload.'})}
  const name=String(body.name||'').slice(0,240)
  const extension=name.split('.').pop()?.toLowerCase()
  if(!['docx','pdf'].includes(extension))return json(400,{error:'Upload a Word (.docx) or PDF (.pdf) sermon-notes file.'})
  const buffer=Buffer.from(String(body.data||''),'base64')
  if(!buffer.length)return json(400,{error:'The uploaded sermon-notes file is empty.'})
  if(buffer.length>MAX_FILE_BYTES)return json(413,{error:'This sermon-notes file is too large. Upload a file smaller than 4.5 MB.'})
  try{
    const extracted=extension==='docx'?(await mammoth.extractRawText({buffer})).value:(await pdf(buffer)).text
    const text=clean(extracted)
    if(text.length<80)return json(422,{error:'Brevity could not find enough readable text in this document. If it is a scanned PDF, export it as a searchable PDF or Word document first.'})
    return json(200,{text,fileName:name,sourceKind:'notes',characters:text.length})
  }catch(error){
    console.error('[sermon-notes-import]',error)
    return json(422,{error:'Brevity could not extract readable sermon notes from this file. Try saving it again as a Word document or searchable PDF.'})
  }
}

export const config={path:'/.netlify/functions/sermon-notes-import'}
