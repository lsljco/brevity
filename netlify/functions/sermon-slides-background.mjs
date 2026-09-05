import {getStore} from '@netlify/blobs'
import householdAuth from './household-auth.js'
import {buildSermonSlides,sermonSlidesFileName} from '../lib/sermon-slides.mjs'
import {buildSevenDayDevotionsPdf} from '../lib/devotion-document.mjs'
import {publishDevotionTarget,publishSlideTarget,publishVisualTargets} from '../lib/onedrive-targets.mjs'
import {sermonGuideBaseName} from '../lib/sermon-times-documents.mjs'
import {withRetry} from '../lib/retry.mjs'
import {markSermonWorkflowComplete,updateSermonWorkflow} from '../lib/sermon-workflow-state.mjs'
const {readSession}=householdAuth
const HOUSEHOLD_ID=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family',STORE_NAME='brevity-sermon-slides'
const store=()=>getStore({name:STORE_NAME,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const statusKey=id=>`${HOUSEHOLD_ID}/slides/${id}/status`,fileKey=id=>`${HOUSEHOLD_ID}/slides/${id}/deck.pptx`,assetKey=(id,index,kind='slides')=>`${HOUSEHOLD_ID}/slides/${id}/${kind}/${String(index).padStart(2,'0')}.png`
const retry=(label,operation)=>withRetry(operation,{attempts:3,onRetry:({attempt,error})=>console.warn(`[sermon-assets ${label}] retry ${attempt}`,error.message)})
export default async function handler(request){
 const session=await readSession({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null);if(!session)return new Response(JSON.stringify({error:'Sign in to create sermon slides.'}),{status:401,headers:{'content-type':'application/json'}})
 const body=await request.json().catch(()=>({})),id=String(body.id||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,120);if(!id||!body.notes)return new Response(JSON.stringify({error:'Sermon notes are required.'}),{status:400,headers:{'content-type':'application/json'}})
 const dataStore=store(),fileName=sermonSlidesFileName(body.notes,body.source||{});await dataStore.setJSON(statusKey(id),{state:'generating',completed:0,total:0,fileName,startedAt:new Date().toISOString()})
 try{
  const result=await buildSermonSlides(body.notes,body.source||{},progress=>dataStore.setJSON(statusKey(id),{state:'generating',...progress,fileName,updatedAt:new Date().toISOString()}))
  await dataStore.set(fileKey(id),result.buffer)
  await Promise.all([...result.assets.map(a=>dataStore.set(assetKey(id,a.index),a.buffer)),...result.devotionAssets.map(a=>dataStore.set(assetKey(id,a.index,'devotions'),a.buffer))])
  const baseName=sermonGuideBaseName(body.notes.documentTitle||body.source?.title||'Sermon',body.source?.sermonDate||body.notes.sermonDate)
  let oneDrive={state:'not-connected'},visuals={state:'not-connected'},devotions={state:'not-connected'}
  try{oneDrive=await retry('slides',()=>publishSlideTarget({pptx:result.buffer,fileName}));await updateSermonWorkflow(id,'slides','complete',{slideCount:result.slideCount,publishing:oneDrive.state})}catch(error){console.error('[sermon-slides onedrive]',error);oneDrive={state:'error',error:error.message||'OneDrive slide publishing failed.'};await updateSermonWorkflow(id,'slides','error',{error:oneDrive.error,slideCount:result.slideCount})}
  try{visuals=await retry('visuals',()=>publishVisualTargets({assets:[...result.assets,...result.devotionAssets.map((a,i)=>({...a,index:result.assets.length+i+1}))],baseName}));await updateSermonWorkflow(id,'visuals','complete',{visualCount:result.assets.length+result.devotionAssets.length,publishing:visuals.state})}catch(error){console.error('[sermon-visuals onedrive]',error);visuals={state:'error',error:error.message||'OneDrive image publishing failed.'};await updateSermonWorkflow(id,'visuals','error',{error:visuals.error,visualCount:result.assets.length+result.devotionAssets.length})}
  try{const devotionPdf=await buildSevenDayDevotionsPdf(body.notes,body.source||{},{assets:result.devotionAssets});devotions=await retry('devotions',()=>publishDevotionTarget({pdf:devotionPdf,baseName}));await updateSermonWorkflow(id,'devotions','complete',{publishing:devotions.state,days:7})}catch(error){console.error('[sermon-devotions onedrive]',error);devotions={state:'error',error:error.message||'OneDrive devotion publishing failed.'};await updateSermonWorkflow(id,'devotions','error',{error:devotions.error})}
  const hasError=[oneDrive,visuals,devotions].some(value=>value.state==='error')
  if(!hasError)await markSermonWorkflowComplete(id)
  await dataStore.setJSON(statusKey(id),{state:hasError?'needs-attention':'ready',slideCount:result.slideCount,completed:result.slideCount+result.devotionAssets.length,total:result.slideCount+result.devotionAssets.length,fileName,oneDrive,visuals,devotions,visualCount:result.assets.length+result.devotionAssets.length,updatedAt:new Date().toISOString(),download:`/.netlify/functions/sermon-slides?id=${encodeURIComponent(id)}&download=1`})
 }catch(error){console.error('[sermon-slides-background]',error);for(const stage of ['slides','visuals','devotions'])await updateSermonWorkflow(id,stage,'error',{error:error.message||'Brevity could not create the sermon slides.'}).catch(()=>{});await dataStore.setJSON(statusKey(id),{state:'error',error:error.message||'Brevity could not create the sermon slides.',fileName,updatedAt:new Date().toISOString()})}
 return new Response(JSON.stringify({accepted:true}),{status:202,headers:{'content-type':'application/json'}})
}
export const config={background:true,path:'/.netlify/functions/sermon-slides-background'}
