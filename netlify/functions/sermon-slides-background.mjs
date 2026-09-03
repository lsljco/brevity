import {getStore} from '@netlify/blobs'
import householdAuth from './household-auth.js'
import {buildSermonSlides,sermonSlidesFileName} from '../lib/sermon-slides.mjs'
import {buildSevenDayDevotionsPdf} from '../lib/devotion-document.mjs'
import {publishDevotionTarget,publishSlideTarget,publishVisualTargets} from '../lib/onedrive-targets.mjs'
import {sermonGuideBaseName} from '../lib/sermon-times-documents.mjs'
const {readSession}=householdAuth
const HOUSEHOLD_ID=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family',STORE_NAME='brevity-sermon-slides'
const store=()=>getStore({name:STORE_NAME,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const statusKey=id=>`${HOUSEHOLD_ID}/slides/${id}/status`,fileKey=id=>`${HOUSEHOLD_ID}/slides/${id}/deck.pptx`,assetKey=(id,index,kind='slides')=>`${HOUSEHOLD_ID}/slides/${id}/${kind}/${String(index).padStart(2,'0')}.png`
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
  try{oneDrive=await publishSlideTarget({pptx:result.buffer,fileName})}catch(error){console.error('[sermon-slides onedrive]',error);oneDrive={state:'error',error:error.message||'OneDrive slide publishing failed.'}}
  try{visuals=await publishVisualTargets({assets:[...result.assets,...result.devotionAssets.map((a,i)=>({...a,index:result.assets.length+i+1}))],baseName})}catch(error){console.error('[sermon-visuals onedrive]',error);visuals={state:'error',error:error.message||'OneDrive image publishing failed.'}}
  try{const devotionPdf=await buildSevenDayDevotionsPdf(body.notes,body.source||{},{assets:result.devotionAssets});devotions=await publishDevotionTarget({pdf:devotionPdf,baseName})}catch(error){console.error('[sermon-devotions onedrive]',error);devotions={state:'error',error:error.message||'OneDrive devotion publishing failed.'}}
  await dataStore.setJSON(statusKey(id),{state:'ready',slideCount:result.slideCount,completed:result.slideCount+result.devotionAssets.length,total:result.slideCount+result.devotionAssets.length,fileName,oneDrive,visuals,devotions,visualCount:result.assets.length+result.devotionAssets.length,updatedAt:new Date().toISOString(),download:`/.netlify/functions/sermon-slides?id=${encodeURIComponent(id)}&download=1`})
 }catch(error){console.error('[sermon-slides-background]',error);await dataStore.setJSON(statusKey(id),{state:'error',error:error.message||'Brevity could not create the sermon slides.',fileName,updatedAt:new Date().toISOString()})}
 return new Response(JSON.stringify({accepted:true}),{status:202,headers:{'content-type':'application/json'}})
}
export const config={background:true,path:'/.netlify/functions/sermon-slides-background'}
