const ENDPOINT='/.netlify/functions/project-images'
export const PROJECT_IMAGE_EVENT='brevity-project-image-state'
const active=new Map(),states=new Map()
export const projectImageState=id=>states.get(id)||{state:'pending'}
const announce=(id,status)=>{states.set(id,status);if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(PROJECT_IMAGE_EVENT,{detail:{id,status}}));return status}
async function request(id,options={}){
 const response=await fetch(`${ENDPOINT}?projectId=${encodeURIComponent(id)}`,{credentials:'include',signal:AbortSignal.timeout(15000),...options})
 const body=await response.json().catch(()=>({}))
 if(!response.ok)throw new Error(body.error||'The project image is temporarily unavailable.')
 return body
}
export function ensureProjectImage(id,{canGenerate=true,retry=false}={}){
 if(!id)return Promise.resolve({state:'not-needed'})
 if(active.has(id))return active.get(id)
 const pending=(async()=>{
  let status=announce(id,await request(id))
  if(canGenerate&&(status.state==='pending'||status.state==='obsolete'||retry&&status.state==='error')){
   status=announce(id,await request(id,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:id,retry})}))
  }
  const deadline=Date.now()+4*60_000
  while(['queued','generating'].includes(status.state)&&Date.now()<deadline){
   await new Promise(resolve=>setTimeout(resolve,2000))
   status=announce(id,await request(id))
  }
  if(['queued','generating'].includes(status.state))status=announce(id,{state:'error',error:'The image is still processing. Retry to check its progress.'})
  return status
 })().catch(error=>announce(id,{state:'error',error:error.message||'Image generation needs a retry.'})).finally(()=>active.delete(id))
 active.set(id,pending)
 return pending
}
