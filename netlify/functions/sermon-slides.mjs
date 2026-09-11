import {getStore} from '@netlify/blobs'
import householdAuth from './household-auth.js'
const {readSession}=householdAuth
const HOUSEHOLD_ID=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family',STORE_NAME='brevity-sermon-slides'
const store=()=>getStore({name:STORE_NAME,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const statusKey=id=>`${HOUSEHOLD_ID}/slides/${id}/status`,fileKey=id=>`${HOUSEHOLD_ID}/slides/${id}/deck.pptx`,devotionsFileKey=id=>`${HOUSEHOLD_ID}/slides/${id}/devotions.pdf`,devotionAssetKey=(id,index)=>`${HOUSEHOLD_ID}/slides/${id}/devotions/${String(index).padStart(2,'0')}.png`
const safeId=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,120)
export default async function handler(request){
 const session=await readSession({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
 if(!session)return new Response(JSON.stringify({error:'Sign in to access sermon slides.'}),{status:401,headers:{'content-type':'application/json'}})
 const url=new URL(request.url),id=safeId(url.searchParams.get('id'))
 if(!id)return new Response(JSON.stringify({error:'A slide-deck id is required.'}),{status:400,headers:{'content-type':'application/json'}})
 const dataStore=store(),asset=url.searchParams.get('asset')
 if(asset==='devotion'){
   const index=Number(url.searchParams.get('index'))
   if(!Number.isInteger(index)||index<1||index>7)return new Response('A devotion index from 1 to 7 is required.',{status:400})
   const bytes=await dataStore.get(devotionAssetKey(id,index),{type:'arrayBuffer'}).catch(()=>null)
   if(!bytes)return new Response('Devotion image not found.',{status:404})
   return new Response(bytes,{headers:{'content-type':'image/png','cache-control':'private, max-age=300'}})
 }
 if(asset==='devotions'){
   const bytes=await dataStore.get(devotionsFileKey(id),{type:'arrayBuffer'}).catch(()=>null)
   if(!bytes)return new Response('Seven-day devotion guide not found.',{status:404})
   return new Response(bytes,{headers:{'content-type':'application/pdf','content-disposition':`attachment; filename="${id}-seven-day-devotions.pdf"`,'cache-control':'private, no-store'}})
 }
 if(url.searchParams.get('download')){
   const [bytes,status]=await Promise.all([dataStore.get(fileKey(id),{type:'arrayBuffer'}).catch(()=>null),dataStore.get(statusKey(id),{type:'json'}).catch(()=>null)])
   if(!bytes)return new Response('Slide deck not found.',{status:404})
   const filename=String(status?.fileName||`${id}-sermon-slides.pptx`).replace(/["\r\n]/g,'')
   return new Response(bytes,{headers:{'content-type':'application/vnd.openxmlformats-officedocument.presentationml.presentation','content-disposition':`attachment; filename="${filename}"`,'cache-control':'private, no-store'}})
 }
 const status=await dataStore.get(statusKey(id),{type:'json'}).catch(()=>null)
 return new Response(JSON.stringify(status||{state:'not-started'}),{headers:{'content-type':'application/json','cache-control':'no-store'}})
}
export const config={path:'/.netlify/functions/sermon-slides'}
