const ENDPOINT='/.netlify/functions/sermon-formation'

async function parse(response){
  const body=await response.json().catch(()=>({}))
  if(!response.ok) throw new Error(body.error||`Brevity sermon analysis returned ${response.status}.`)
  return body
}

export async function generateSermonFormation({transcript,sermonDate,serviceType,title,targetDate}){
  const response=await fetch(ENDPOINT,{
    method:'POST',
    credentials:'include',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({transcript,sermonDate,serviceType,title,targetDate})
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
