import householdAuth from './household-auth.js'
import { getStore } from '@netlify/blobs'

const { readSession }=householdAuth
const MODEL=process.env.BREVITY_AI_MODEL||'gpt-5.6'
const STORE_NAME='brevity-ai-tutor'
const PROMPT_VERSION='reading-v2-directions'
const HOUSEHOLD_ID=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)})
const store=()=>getStore({name:STORE_NAME,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const safeDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):''
const allowedMinutes=new Set([10,20,30,45])
const cleanStrings=(value,max=8)=>Array.isArray(value)?value.map(item=>String(item||'').trim()).filter(Boolean).slice(0,max):[]
const exerciseId=()=>`reading-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,8)}`

const schema={type:'object',additionalProperties:false,properties:{title:{type:'string',maxLength:140},intro:{type:'string',maxLength:500},directions:{type:'string',minLength:80,maxLength:900},requiredDirectionPoints:{type:'array',minItems:3,maxItems:6,items:{type:'string',maxLength:220}},passage:{type:'string',minLength:500,maxLength:5000},sectionMinutes:{type:'integer',minimum:5,maximum:15},difficultyNote:{type:'string',maxLength:500},vocabulary:{type:'array',minItems:3,maxItems:6,items:{type:'object',additionalProperties:false,properties:{word:{type:'string',maxLength:60},meaning:{type:'string',maxLength:220}},required:['word','meaning']}},questions:{type:'array',minItems:4,maxItems:7,items:{type:'object',additionalProperties:false,properties:{id:{type:'string',maxLength:40},type:{type:'string',enum:['multiple_choice','short_response']},prompt:{type:'string',maxLength:500},choices:{type:'array',maxItems:4,items:{type:'string',maxLength:220}},correctAnswer:{type:'string',maxLength:500},rubric:{type:'string',maxLength:700},skill:{type:'string',maxLength:120}},required:['id','type','prompt','choices','correctAnswer','rubric','skill']}},required:['title','intro','directions','requiredDirectionPoints','passage','sectionMinutes','difficultyNote','vocabulary','questions']}
const outputText=response=>Array.isArray(response?.output)?response.output.flatMap(item=>Array.isArray(item?.content)?item.content:[]).map(part=>typeof part?.text==='string'?part.text:'').join('').trim():''
const publicQuestion=q=>({id:q.id,type:q.type,prompt:q.prompt,choices:q.choices,skill:q.skill})
export const educationAiExerciseInternals={schema,publicQuestion,PROMPT_VERSION,allowedMinutes,safeDate}

export const handler=async event=>{
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  const session=await readSession(event)
  if(!session)return json(401,{error:'Sign in required.'})
  if(!process.env.OPENAI_API_KEY)return json(503,{error:'Brevity AI is not configured.'})
  let body={}
  try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request.'})}
  const instructionalDate=safeDate(body.instructionalDate),targetMinutes=Number(body.targetMinutes)
  if(!instructionalDate||!allowedMinutes.has(targetMinutes))return json(400,{error:'Choose a valid instructional date and reading duration.'})
  const standards=cleanStrings(body.standardCodes,10),masteryTargets=cleanStrings(body.masteryTargets,10)
  const curriculum=String(body.curriculum||'').slice(0,1000),continuation=String(body.continuationContext||'').slice(0,1200)
  const input=`Create one original Grade 3 reading section for Brevity Education. It is one part of an overall ${targetMinutes}-minute assignment; this section should take 5–15 minutes. Use accessible sentence structure while preserving meaningful Grade 3 vocabulary and ideas. Curriculum: ${curriculum}. Standards: ${standards.join(', ')}. Mastery targets: ${masteryTargets.join(', ')}.${continuation?` Continue from this context without repeating it: ${continuation}`:''} Write clear student directions that include 3–6 material requirements. Also return those requirements separately in requiredDirectionPoints so Brevity can check whether the student understood every direction before starting. Directions should require Isaiah to read the passage, attend to vocabulary, complete all questions, and use text evidence when an item asks for it; include any time or response-format requirement that matters. Include 3–6 vocabulary words and 4–7 comprehension questions. Mix literal comprehension, vocabulary, evidence/reasoning, and inference. Multiple-choice questions must have exactly four choices and one unambiguous correct answer. Short responses need a concise expected answer and rubric. Do not reveal answers in student-facing prompts.`
  try{
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:MODEL,store:false,instructions:'Generate rigorous age-appropriate instructional material aligned to the supplied standards. Return only the requested structured output.',input,text:{format:{type:'json_schema',name:'reading_exercise',strict:true,schema}}})})
    const payload=await response.json().catch(()=>({}))
    if(!response.ok)return json(502,{error:'Brevity could not generate the reading exercise.'})
    let generated
    try{generated=JSON.parse(outputText(payload))}catch{return json(502,{error:'Brevity received an unreadable exercise.'})}
    const id=exerciseId(),record={id,studentId:'isaiah',instructionalDate,targetMinutes,standards,masteryTargets,curriculum,model:MODEL,promptVersion:PROMPT_VERSION,createdAt:new Date().toISOString(),createdBy:session.member,...generated}
    await store().setJSON(`${HOUSEHOLD_ID}/education/exercises/${id}`,record,{onlyIfNew:true})
    return json(201,{exercise:{id,title:generated.title,intro:generated.intro,directions:generated.directions,passage:generated.passage,sectionMinutes:generated.sectionMinutes,difficultyNote:generated.difficultyNote,vocabulary:generated.vocabulary,questions:generated.questions.map(publicQuestion)},provenance:{model:MODEL,promptVersion:PROMPT_VERSION,standards,curriculum,createdBy:session.member}})
  }catch(error){console.error('[education-ai-exercise]',error);return json(502,{error:'Brevity could not generate the reading exercise.'})}
}
