const ENDPOINT='/.netlify/functions/sermon-formation'

async function parse(response){
  const body=await response.json().catch(()=>({}))
  if(!response.ok) throw new Error(body.error||`Brevity sermon analysis returned ${response.status}.`)
  return body
}

export async function generateSermonFormation({transcript,sermonDate,serviceType,title,targetDate}){
  const response=await fetch(ENDPOINT,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({transcript,sermonDate,serviceType,title,targetDate})
  })
  return parse(response)
}
