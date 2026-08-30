const BACKGROUND_ENDPOINT='/.netlify/functions/sermon-formation-background'
const STATUS_ENDPOINT='/.netlify/functions/sermon-formation-status'
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))

async function parse(response){
  const body=await response.json().catch(()=>({}))
  if(!response.ok) throw new Error(body.error||`Brevity sermon analysis returned ${response.status}.`)
  return body
}

export async function generateSermonFormation({transcript,sermonDate,serviceType,title,targetDate,sourceKind='transcript'}){
  const request={transcript,sermonDate,serviceType,title,targetDate,sourceKind}
  const jobId=crypto.randomUUID()
  const accepted=await fetch(BACKGROUND_ENDPOINT,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({jobId,request})})
  if(!accepted.ok&&accepted.status!==202)await parse(accepted)
  const started=Date.now()
  while(Date.now()-started<14*60*1000){
    try{
      const status=await fetch(`${STATUS_ENDPOINT}?jobId=${encodeURIComponent(jobId)}`,{credentials:'include'})
      const job=await parse(status)
      if(job.state==='ready')return job.result
      if(job.state==='error')throw new Error(job.error||'Background sermon analysis failed.')
    }catch(error){
      if(!/returned 50[234]|fetch failed|network/i.test(error.message||''))throw error
    }
    await wait(3000)
  }
  throw new Error('Brevity is still analyzing this sermon source. Keep this page open and try again in a moment.')
}

export async function archiveSermonDocuments({notes,source}){
  const response=await fetch('/.netlify/functions/sermon-documents',{
    method:'POST',credentials:'include',headers:{'content-type':'application/json'},
    body:JSON.stringify({notes,source})
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

export const oneDriveConnectUrl=folderUrl=>`/.netlify/functions/onedrive-oauth-start${folderUrl?`?folderUrl=${encodeURIComponent(folderUrl)}`:''}`

export async function generateSermonSlides({id,notes,source}){const response=await fetch('/.netlify/functions/sermon-slides-background',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({id,notes,source})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`Slide generation returned ${response.status}.`);return payload}
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
