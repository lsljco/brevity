import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'
import { buildSevenDayDevotionsPdf } from '../lib/devotion-document.mjs'
import { buildTimesSermonDocx, buildTimesSermonPdf, sermonGuideBaseName } from '../lib/sermon-times-documents.mjs'
import { publishDevotionTarget, publishSermonTargetDocuments } from '../lib/onedrive-targets.mjs'

const { readSession }=householdAuth
const HOUSEHOLD_ID=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
const STORE_NAME='brevity-sermon-repository'
const indexKey=`${HOUSEHOLD_ID}/sermons/index`
const fileKey=(id,format)=>`${HOUSEHOLD_ID}/sermons/${id}/sermon.${format}`
const store=()=>getStore({name:STORE_NAME,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const clean=value=>String(value||'').trim()
const slugify=value=>clean(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'sermon-notes'
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)})

export const handler=async event=>{
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  const session=await readSession(event).catch(()=>null)
  if(!session)return json(401,{error:'Sign in to publish sermon artifacts.'})
  let body={}
  try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request body.'})}
  const notes=body.notes||{}
  const source=body.source||{}
  const title=clean(notes.documentTitle||notes.title||source.title)
  if(!title)return json(400,{error:'Sermon notes need a title before publishing.'})

  try{
    const sermonDate=clean(source.sermonDate||notes.sermonDate)||new Date().toISOString().slice(0,10)
    const id=`${sermonDate}-${slugify(title)}`
    const baseName=sermonGuideBaseName(title,sermonDate)
    const pdfOnly=source.sourceKind==='notes'
    const [docx,pdf]=await Promise.all([buildTimesSermonDocx(notes,source),buildTimesSermonPdf(notes,source)])
    const dataStore=store()
    await Promise.all([dataStore.set(fileKey(id,'pdf'),pdf),dataStore.set(fileKey(id,'docx'),docx)])

    let oneDrive={state:'not-connected'}
    let devotions={state:'not-started'}
    try{
      oneDrive=await publishSermonTargetDocuments({docx,pdf,baseName,pdfOnly})
      if(Array.isArray(notes.sevenDayFormationPlan)&&notes.sevenDayFormationPlan.length){
        const devotionPdf=await buildSevenDayDevotionsPdf(notes,source)
        devotions=await publishDevotionTarget({pdf:devotionPdf,baseName})
      }
    }catch(error){
      console.error('[sermon-workflow OneDrive]',error)
      oneDrive={state:'error',error:error.message||'OneDrive publishing failed.'}
    }

    const files={pdf:`/.netlify/functions/sermon-documents?id=${encodeURIComponent(id)}&format=pdf`,docx:`/.netlify/functions/sermon-documents?id=${encodeURIComponent(id)}&format=docx`}
    const entry={id,title,baseName,fileNames:{pdf:`${baseName}.pdf`,docx:`${baseName}.docx`},sermonDate,serviceType:clean(source.serviceType),preacherTeacher:clean(notes.preacherTeacher),sourceKind:source.sourceKind||'transcript',updatedAt:new Date().toISOString(),updatedBy:session.member,files,oneDrive:{...oneDrive,devotions}}
    const prior=await dataStore.get(indexKey,{type:'json'}).catch(()=>[])
    await dataStore.setJSON(indexKey,[entry,...(Array.isArray(prior)?prior:[]).filter(item=>item.id!==id)].slice(0,200))

    const host=String(event.headers['x-forwarded-host']||event.headers.host||'brevityoflife.netlify.app').split(',')[0].trim()
    const proto=String(event.headers['x-forwarded-proto']||'https').split(',')[0].trim()
    const baseUrl=`${proto}://${host}`
    let assets={state:'queued'}
    try{
      const response=await fetch(`${baseUrl}/.netlify/functions/sermon-slides-background`,{method:'POST',headers:{'content-type':'application/json',cookie:event.headers.cookie||''},body:JSON.stringify({id,notes,source:{...source,title}})})
      if(!response.ok&&response.status!==202)assets={state:'error',error:`Visual generation returned ${response.status}.`}
    }catch(error){assets={state:'error',error:error.message||'Could not queue visual generation.'}}

    return json(200,{document:entry,assets})
  }catch(error){
    console.error('[sermon-workflow]',error)
    return json(500,{error:error.message||'Brevity could not complete the sermon workflow.'})
  }
}
