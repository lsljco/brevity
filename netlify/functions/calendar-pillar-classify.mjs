import householdAuth from './household-auth.js'
const {readSession}=householdAuth
const MODEL=process.env.BREVITY_AI_MODEL||'gpt-5.6'
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)})
const text=response=>(response.output||[]).flatMap(item=>item.content||[]).map(item=>item.text||'').join('').trim()
export const handler=async event=>{
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  const session=await readSession(event).catch(()=>null);if(!session)return json(401,{error:'Sign in to classify household activity.'})
  if(!process.env.OPENAI_API_KEY)return json(503,{error:'Brevity intelligence is not configured.'})
  let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request body.'})}
  const pillars=(Array.isArray(body.pillars)?body.pillars:[]).slice(0,20).map(item=>({id:String(item.id||'').slice(0,80),name:String(item.name||'').slice(0,120)})).filter(item=>item.id&&item.name)
  const events=(Array.isArray(body.events)?body.events:[]).slice(0,30).map(item=>({id:String(item.id||'').slice(0,180),title:String(item.title||'').slice(0,500),description:String(item.description||item.notes||'').slice(0,1000),location:String(item.location||'').slice(0,300),calendar:String(item.calendarName||item.source||'').slice(0,200)})).filter(item=>item.id&&item.title)
  if(!pillars.length||!events.length)return json(400,{error:'Pillars and calendar activities are required.'})
  const schema={type:'object',additionalProperties:false,required:['classifications'],properties:{classifications:{type:'array',maxItems:30,items:{type:'object',additionalProperties:false,required:['id','confidence','reason','allocations'],properties:{id:{type:'string'},confidence:{type:'string',enum:['high','medium','low']},reason:{type:'string'},allocations:{type:'array',maxItems:4,items:{type:'object',additionalProperties:false,required:['pillarId','percent'],properties:{pillarId:{type:'string',enum:pillars.map(item=>item.id)},percent:{type:'number',minimum:1,maximum:100}}}}}}}}}
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:MODEL,store:false,max_output_tokens:3500,input:`Classify each calendar activity into the supplied household pillars. Multi-pillar attribution is allowed, but allocation percentages for an event must total exactly 100. Confidence is high only when title/context is unambiguous, medium when provisional confirmation is useful, and low when the user must decide. Do not infer attendance or completion. Return every input id exactly once.\nPILLARS: ${JSON.stringify(pillars)}\nEVENTS: ${JSON.stringify(events)}`,text:{format:{type:'json_schema',name:'calendar_pillar_classification',strict:true,schema}}})})
  const payload=await response.json().catch(()=>({}));if(!response.ok)return json(response.status,{error:payload.error?.message||'OpenAI classification failed.'})
  let result;try{result=JSON.parse(text(payload))}catch{return json(502,{error:'Brevity returned an invalid classification.'})}
  return json(200,{...result,generatedAt:new Date().toISOString(),model:MODEL,notice:'Classifications are provisional until confirmed; no calendar or household record was changed.'})
}
