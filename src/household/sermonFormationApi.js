const START_ENDPOINT='/.netlify/functions/sermon-formation-start'
const STATUS_ENDPOINT='/.netlify/functions/sermon-formation-status'
export const SERMON_ANALYSIS_RESUME_KEY='brevity:sermon-analysis:pending:v1'
const POLL_INTERVAL_MS=3000
const CLIENT_WAIT_LIMIT_MS=22*60*1000
const wait=(ms,signal)=>new Promise((resolve,reject)=>{
  let cancel
  const finish=()=>{if(cancel)signal?.removeEventListener('abort',cancel);resolve()}
  const timer=setTimeout(finish,ms)
  if(!signal)return
  cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(Object.assign(new Error('Stopped waiting for sermon analysis.'),{name:'AbortError'}))}
  if(signal.aborted)return cancel()
  signal.addEventListener('abort',cancel,{once:true})
})
export const ONEDRIVE_REPOSITORY_SHARE_URL='https://1drv.ms/f/c/0675525c56f14fef/IgDc-iXzsiwjSLJBV5ifMvBfASYUCca6MBtroniveZWUJhU'

async function parse(response){
  const body=await response.json().catch(()=>({}))
  if(!response.ok) throw new Error(body.error||`Brevity sermon analysis returned ${response.status}.`)
  return body
}

const analysisStorage=()=>globalThis.localStorage
export function getPendingSermonAnalysis(){
  try{
    const value=JSON.parse(analysisStorage()?.getItem(SERMON_ANALYSIS_RESUME_KEY)||'null')
    return value&&typeof value.jobId==='string'?value:null
  }catch{return null}
}
function retainSermonAnalysis(value){
  try{analysisStorage()?.setItem(SERMON_ANALYSIS_RESUME_KEY,JSON.stringify(value))}catch{/* private browsing or storage disabled */}
  return value
}
export function clearPendingSermonAnalysis(jobId=''){
  try{
    const current=getPendingSermonAnalysis()
    if(!jobId||current?.jobId===jobId)analysisStorage()?.removeItem(SERMON_ANALYSIS_RESUME_KEY)
  }catch{/* storage disabled */}
}
async function queueRetainedAnalysis(jobId,{restart=false,signal}={}){
  const response=await fetch(START_ENDPOINT,{method:'POST',credentials:'include',signal,headers:{'content-type':'application/json'},body:JSON.stringify({jobId,restart})})
  return parse(response)
}
async function pollSermonAnalysis(pending,{restart=false,signal,pollIntervalMs=POLL_INTERVAL_MS,waitLimitMs=CLIENT_WAIT_LIMIT_MS}={}){
  const jobId=pending?.jobId
  if(!jobId)throw new Error('There is no retained sermon analysis to resume.')
  if(restart)await queueRetainedAnalysis(jobId,{restart:true,signal})
  const started=Date.now()
  while(Date.now()-started<waitLimitMs){
    try{
      const status=await fetch(`${STATUS_ENDPOINT}?jobId=${encodeURIComponent(jobId)}`,{credentials:'include',signal})
      const job=await parse(status)
      if(job.state==='ready'){
        retainSermonAnalysis({...pending,state:'ready',completedAt:new Date().toISOString(),result:job.result})
        return {...job.result,resumeContext:pending.context||{}}
      }
      if(job.state==='stalled'&&job.retryable){
        await queueRetainedAnalysis(jobId,{signal})
      }else if(['error','timeout'].includes(job.state)||(job.state==='stalled'&&!job.retryable)){
        const error=new Error(job.error||job.reason||'Sermon analysis stopped before it completed. Retry the retained source; the active sermon was not changed.')
        error.retryable=job.retryable!==false
        error.jobId=jobId
        throw error
      }
    }catch(error){
      if(error?.name==='AbortError')throw error
      if(!/returned 50[234]|fetch failed|network/i.test(error.message||''))throw error
    }
    await wait(pollIntervalMs,signal)
  }
  const error=new Error('Sermon analysis reached its time limit. Retry the retained source; the active sermon was not changed.')
  error.retryable=true
  error.jobId=jobId
  throw error
}

export async function resumeSermonFormation({restart=false,signal,pollIntervalMs,waitLimitMs}={}){
  const pending=getPendingSermonAnalysis()
  if(!pending)throw new Error('There is no retained sermon analysis to resume.')
  return pollSermonAnalysis(pending,{restart,signal,pollIntervalMs,waitLimitMs})
}

export async function generateSermonFormation({transcript,sermonDate,serviceType,title,targetDate,sourceKind='transcript',fileName='',signal,pollIntervalMs,waitLimitMs}){
  const request={transcript,sermonDate,serviceType,title,targetDate,sourceKind}
  const accepted=await fetch(START_ENDPOINT,{method:'POST',credentials:'include',signal,headers:{'content-type':'application/json'},body:JSON.stringify(request)})
  const start=await parse(accepted)
  const jobId=start.jobId
  if(!jobId)throw new Error('Brevity did not return a sermon-analysis job identifier.')
  const pending=retainSermonAnalysis({
    jobId,sourceHash:start.sourceHash||'',baseActiveVersion:Number(start.baseActiveVersion||0),startedAt:new Date().toISOString(),
    context:{sermonDate,serviceType,title,targetDate,sourceKind,fileName},
  })
  return pollSermonAnalysis(pending,{signal,pollIntervalMs,waitLimitMs})
}

export async function prepareSermonActivation({draftId,sourceHash,expectedVersion}){
  const response=await fetch('/.netlify/functions/brevity-assistant-actions?action=prepare-sermon',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({draftId,sourceHash,expectedVersion})})
  return parse(response)
}

export async function applySermonActivation({proposalId,confirmation}){
  const response=await fetch('/.netlify/functions/brevity-assistant-actions?action=execute',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({proposalId,confirmed:true,confirmation})})
  return parse(response)
}

export async function archiveSermonDocuments({activeVersion,sourceHash}){
  const response=await fetch('/.netlify/functions/sermon-workflow',{
    method:'POST',credentials:'include',headers:{'content-type':'application/json'},
    body:JSON.stringify({activeVersion,sourceHash})
  })
  return parse(response)
}

export async function listSermonDocuments(){
  const response=await fetch('/.netlify/functions/sermon-documents',{credentials:'include'})
  return parse(response)
}

export async function importSermonNotes(file){
  if(file.size>4_500_000)throw new Error('This sermon-notes file is too large. Upload a file smaller than 4.5 MB.')
  const bytes=new Uint8Array(await file.arrayBuffer())
  let binary=''
  for(let index=0;index<bytes.length;index+=0x8000)binary+=String.fromCharCode(...bytes.subarray(index,index+0x8000))
  const response=await fetch('/.netlify/functions/sermon-notes-import',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({name:file.name,data:btoa(binary)})})
  return parse(response)
}

export async function getOneDriveStatus(){
  const response=await fetch('/.netlify/functions/onedrive-status',{credentials:'include'})
  return parse(response)
}

export async function generateSermonSlides({id,activeVersion,sourceHash}){const response=await fetch('/.netlify/functions/sermon-slides-background',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({id,activeVersion,sourceHash})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`Slide generation returned ${response.status}.`);return payload}
export async function getSermonSlideStatus(id){const response=await fetch(`/.netlify/functions/sermon-slides?id=${encodeURIComponent(id)}`,{credentials:'include'});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`Slide status returned ${response.status}.`);return payload}

export async function getSermonDeviceRescues(){
  const response=await fetch('/.netlify/functions/sermon-device-rescue',{credentials:'include'})
  return parse(response)
}

export async function importSermonDeviceRescue(deviceExport){
  const response=await fetch('/.netlify/functions/sermon-device-rescue',{
    method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({export:deviceExport})
  })
  return parse(response)
}
