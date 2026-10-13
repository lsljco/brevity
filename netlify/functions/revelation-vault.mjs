import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {HOUSEHOLD_MEMBERS} from '../../src/homehq/projectData.js'
import {vaultStore,vaultKey,sourceKey,jobKey,emptyVault,parseVaultImport,addImport,writeVault,validId,randomUUID,hash} from '../lib/revelation-vault.mjs'
import {getStore} from '../lib/scoped-store.mjs'
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}})
export function createRevelationVaultHandler({authenticate=householdAuth.readSession,storeFactory=vaultStore,workspaceFactory=()=>getStore({name:'brevity-sermon-repository',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN}),dispatch=fetch,now=()=>new Date()}={}){return async request=>{
 const session=await authenticate({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null);if(!session)return json(401,{error:'Sign in to open your Revelation Vault.'})
 const url=new URL(request.url),owner=url.searchParams.get('owner')||session.member
 if(!HOUSEHOLD_MEMBERS.includes(owner)||(owner!==session.member&&session.role!=='admin'))return json(403,{error:'This vault belongs to another member.'})
 try{
  const store=storeFactory(),key=vaultKey(owner),entry=await store.getWithMetadata(key,{type:'json'}),library=entry?.data||emptyVault()
  if(request.method==='GET'){
   const sourceId=url.searchParams.get('source'),jobId=url.searchParams.get('job')
   if(sourceId){if(!library.collections.some(c=>c.id===sourceId))return json(404,{error:'Source not found.'});const source=await store.get(sourceKey(owner,sourceId),{type:'json'});return json(200,source)}
   if(jobId){if(!validId(jobId))return json(400,{error:'Invalid job.'});const job=await store.get(jobKey(owner,jobId),{type:'json'});if(!job)return json(404,{error:'Job not found.'});return json(200,{id:job.id,state:job.state,error:job.error,result:job.result,mode:job.mode})}
   const jobs=await Promise.all(library.jobs.slice(-15).map(id=>store.get(jobKey(owner,id),{type:'json'})));const workspace=await workspaceFactory().get(`${process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'}/ministry/sermon-workspace/v1`,{type:'json'});return json(200,{...library,drafts:library.drafts.map(d=>({...d,sermonId:workspace?.sermons?.find(s=>s.sourceKey===`revelation:${owner}:${d.id}`)?.id||''})),owner,jobStatuses:jobs.filter(Boolean).map(j=>({id:j.id,state:j.state,error:j.error,mode:j.mode}))})
  }
  if(request.method!=='POST')return json(405,{error:'Method not allowed.'})
  if(Number(request.headers.get('content-length')||0)>5000000)return json(413,{error:'Import must be smaller than 3.5 MB.'})
  const raw=await request.text();if(raw.length>5000000)return json(413,{error:'Import must be smaller than 3.5 MB.'});const body=JSON.parse(raw)
  if(['preview','import'].includes(body.action)){
   const parsed=await parseVaultImport(body)
   if(body.action==='preview')return json(200,{id:parsed.id,title:parsed.title,count:parsed.records.length,scope:parsed.scope,needsExtraction:parsed.needsExtraction,quotes:parsed.records.slice(0,3).map(r=>r.quote),alreadyImported:library.collections.some(c=>c.id===parsed.id)})
   if(body.expectedRevision!==library.revision)return json(409,{error:'The vault changed. Refresh before importing.'})
   const result=addImport(library,parsed,owner,session.member,now())
   if(!result.alreadyImported){await store.setJSON(sourceKey(owner,parsed.id),{...parsed,owner,importedBy:session.member,importedAt:now().toISOString()},{onlyIfNew:true});await writeVault(store,key,entry,result.library)}
   return json(200,{id:parsed.id,alreadyImported:result.alreadyImported,needsExtraction:parsed.needsExtraction})
  }
  if(body.action==='reflect'){
   if(body.expectedRevision!==library.revision)return json(409,{error:'The vault changed. Refresh before saving your reflection.'})
   const record=library.discoveries.find(d=>d.id===body.id);if(!record)return json(404,{error:'Discovery not found.'})
   if(typeof body.reflection!=='string'||body.reflection.length>12000||!['To develop','Developing','Reviewed'].includes(body.status))return json(400,{error:'Check the reflection and status.'})
   await writeVault(store,key,entry,{...library,revision:library.revision+1,discoveries:library.discoveries.map(d=>d.id===body.id?{...d,reflection:body.reflection,status:body.status}:d)});return json(200,{ok:true})
  }
  if(body.action==='accept-job'){
   if(!validId(body.jobId))return json(400,{error:'Invalid job.'});const job=await store.get(jobKey(owner,body.jobId),{type:'json'});if(!job||job.state!=='ready')return json(409,{error:'Development is not ready.'})
   if(library.acceptedJobs?.includes(job.id))return json(200,{ok:true})
   if(job.mode==='extract'){
    const known=new Set(library.discoveries.map(d=>d.id)),added=job.result.filter(d=>!known.has(d.id));await writeVault(store,key,entry,{...library,acceptedJobs:[...(library.acceptedJobs||[]),job.id],revision:library.revision+1,discoveries:[...added,...library.discoveries],collections:library.collections.map(c=>c.id===job.collectionId?{...c,needsExtraction:false}:c)})
   }else if(!library.drafts.some(d=>d.id===job.id))await writeVault(store,key,entry,{...library,acceptedJobs:[...(library.acceptedJobs||[]),job.id],discoveries:library.discoveries.map(d=>job.discoveryIds.includes(d.id)&&d.status==='To develop'?{...d,status:'Developing'}:d),revision:library.revision+1,drafts:[{id:job.id,title:job.prompt.slice(0,120),text:job.result,discoveryIds:job.discoveryIds,parentId:job.parentId||'',prompt:job.prompt,createdAt:job.createdAt,createdBy:session.member},...library.drafts]})
   return json(200,{ok:true})
  }
  if(body.action==='handoff'){
   if(body.confirmShared!==true)return json(400,{error:'Review and confirm sharing this draft with the household Sermon Workspace.'})
   const draft=library.drafts.find(d=>d.id===body.draftId);if(!draft)return json(404,{error:'Saved draft not found.'})
   const wstore=workspaceFactory(),wkey=`${process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'}/ministry/sermon-workspace/v1`,went=await wstore.getWithMetadata(wkey,{type:'json'}),workspace=went?.data||{schemaVersion:1,revision:0,series:[],sermons:[]},source=`revelation:${owner}:${draft.id}`,existing=workspace.sermons.find(s=>s.sourceKey===source)
   if(existing)return json(200,{sermonId:existing.id,alreadyImported:true})
   if(workspace.sermons.length>=1000)return json(409,{error:'The Sermon Workspace is full.'})
   const id=`rv-${hash(source).slice(0,32)}`,records=library.discoveries.filter(d=>draft.discoveryIds.includes(d.id)),sermon={id,seriesId:'',title:String(body.title||draft.title).slice(0,200),date:now().toISOString().slice(0,10),serviceType:'Sunday',status:'Draft',version:1,bigIdea:'',scripture:[...new Set(records.flatMap(d=>d.scripture))].join('; '),outline:draft.text,sourceNotes:records.map(d=>`[${d.externalId}] ${d.speaker}\n${d.quote}`).join('\n\n'),revelationReferences:records.map(d=>({owner,id:d.id,collectionId:d.collectionId})),sourceKey:source,sourceName:'Revelation & Content Vault — reviewed selection',approvedNotes:'',recordingUrl:'',transcript:'',publishedUrl:'',assets:[],createdBy:session.member,updatedAt:now().toISOString()}
   const updated={...workspace,revision:workspace.revision+1,sermons:[sermon,...workspace.sermons]};if(JSON.stringify(updated).length>3900000)return json(409,{error:'The Sermon Workspace is too large. Export or shorten existing drafts first.'})
   await writeVault(wstore,wkey,went,updated);return json(200,{sermonId:id})
  }
  if(!['develop','extract','retry'].includes(body.action))return json(400,{error:'Unknown vault action.'})
  let job
  if(body.action==='retry'){
   if(!validId(body.jobId))return json(400,{error:'Invalid job.'});job=await store.get(jobKey(owner,body.jobId),{type:'json'});if(!job)return json(404,{error:'Job not found.'});if(job.state==='ready')return json(200,{id:job.id,state:'ready'});if(['queued','processing'].includes(job.state)&&now()-Date.parse(job.updatedAt||job.createdAt)<600000)return json(202,{id:job.id,state:job.state});job={...job,state:'queued',requestedBy:session.member,updatedAt:now().toISOString()}
  }else{
   const active=await Promise.all(library.jobs.slice(-15).map(id=>store.get(jobKey(owner,id),{type:'json'})));if(active.some(j=>['queued','processing'].includes(j?.state)&&now()-Date.parse(j.updatedAt||j.createdAt)<600000))return json(409,{error:'A vault request is already running. Wait for it to finish.'})
   const ids=Array.isArray(body.discoveryIds)?[...new Set(body.discoveryIds)]:[],records=library.discoveries.filter(d=>ids.includes(d.id)),parent=body.parentId?library.drafts.find(d=>d.id===body.parentId):null
   if(body.action==='develop'&&(!records.length||records.length!==ids.length||body.parentId&&!parent))return json(400,{error:'Select saved discoveries and a valid development draft.'})
   const collection=library.collections.find(c=>c.id===body.collectionId)
   if(body.action==='extract'&&!collection)return json(404,{error:'Collection not found.'})
   const source=collection?await store.get(sourceKey(owner,collection.id),{type:'json'}):null
   if(body.action==='develop'&&(typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>8000))return json(400,{error:'Describe what you want to explore (up to 8,000 characters).'})
   const context=body.action==='extract'?source?.text:JSON.stringify({discoveries:records,previousDraft:parent?.text||''});if(!context||context.length>150000)return json(400,{error:'Choose fewer discoveries or a shorter conversation for this request.'})
   job={id:randomUUID(),owner,mode:body.action==='extract'?'extract':'develop',state:'queued',collectionId:collection?.id||'',discoveryIds:[...new Set([...ids,...(parent?.discoveryIds||[])])],parentId:parent?.id||'',prompt:body.prompt||'Extract discoveries',context,requestedBy:session.member,createdAt:now().toISOString()}
   await writeVault(store,key,entry,{...library,revision:library.revision+1,jobs:[...library.jobs,job.id]})
  }
  await store.setJSON(jobKey(owner,job.id),job)
  const response=await dispatch(new URL('/.netlify/functions/revelation-vault-background',request.url),{method:'POST',headers:{'content-type':'application/json',cookie:request.headers.get('cookie')||''},body:JSON.stringify({owner,id:job.id})})
  if(!response.ok){await store.setJSON(jobKey(owner,job.id),{...job,state:'error',error:'Could not queue development. Retry the retained request.'});return json(502,{error:'Could not queue development. Your source is saved.'})}
  return json(202,{id:job.id,state:'queued'})
 }catch(error){return json(error.status||400,{error:error.message||'The vault could not complete this request.'})}
}}
export default createRevelationVaultHandler()
