const ENDPOINT='/.netlify/functions/sermon-formation'
const BACKGROUND_ENDPOINT='/.netlify/functions/sermon-formation-background'
const STATUS_ENDPOINT='/.netlify/functions/sermon-formation-status'
const BACKGROUND_THRESHOLD=120000
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))

async function parse(response){
  const body=await response.json().catch(()=>({}))
  if(!response.ok) throw new Error(body.error||`Brevity sermon analysis returned ${response.status}.`)
  return body
}

export async function generateSermonFormation({transcript,sermonDate,serviceType,title,targetDate}){
  const request={transcript,sermonDate,serviceType,title,targetDate}
  if(String(transcript||'').length>BACKGROUND_THRESHOLD){
    const jobId=crypto.randomUUID()
    const accepted=await fetch(BACKGROUND_ENDPOINT,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({jobId,request})})
    if(!accepted.ok&&accepted.status!==202)await parse(accepted)
    const started=Date.now()
    while(Date.now()-started<14*60*1000){
      await wait(3000)
      const status=await fetch(`${STATUS_ENDPOINT}?jobId=${encodeURIComponent(jobId)}`,{credentials:'include'})
      const job=await parse(status)
      if(job.state==='ready')return job.result
      if(job.state==='error')throw new Error(job.error||'Background sermon analysis failed.')
    }
    throw new Error('Brevity is still analyzing this transcript. Keep this page open and try again in a moment.')
  }
  const response=await fetch(ENDPOINT,{
    method:'POST',
    credentials:'include',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(request)
  })
  return parse(response)
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
