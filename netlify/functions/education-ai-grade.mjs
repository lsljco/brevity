import householdAuth from './household-auth.js'
import { getStore } from '@netlify/blobs'

const { readSession }=householdAuth
const MODEL=process.env.BREVITY_AI_MODEL||'gpt-5.6'
const HOUSEHOLD_ID=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
const STORE_NAME='brevity-ai-tutor'
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)})
const store=()=>getStore({name:STORE_NAME,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const normalize=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ')
const outputText=response=>Array.isArray(response?.output)?response.output.flatMap(item=>Array.isArray(item?.content)?item.content:[]).map(part=>typeof part?.text==='string'?part.text:'').join('').trim():''
const shortSchema={type:'object',additionalProperties:false,properties:{score:{type:'integer',minimum:0,maximum:2},feedback:{type:'string',maxLength:400},evidence:{type:'string',maxLength:400}},required:['score','feedback','evidence']}
const directionsSchema={type:'object',additionalProperties:false,properties:{capturedPoints:{type:'array',maxItems:6,items:{type:'string',maxLength:220}},missedPoints:{type:'array',maxItems:6,items:{type:'string',maxLength:220}},score:{type:'integer',minimum:0,maximum:100},feedback:{type:'string',maxLength:600}},required:['capturedPoints','missedPoints','score','feedback']}

async function gradeDirections(record,studentSummary){
  if(!studentSummary.trim())return{capturedPoints:[],missedPoints:record.requiredDirectionPoints||[],score:0,feedback:'Read the directions again, then explain what you are supposed to do before starting.'}
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:MODEL,store:false,instructions:'Grade whether a Grade 3 student understood written directions. Credit paraphrases. Use only the supplied required direction points. Identify every material point the student captured and every material point missed. Do not grade subject-matter knowledge here.',input:JSON.stringify({directions:record.directions,requiredDirectionPoints:record.requiredDirectionPoints,studentExplanation:studentSummary}),text:{format:{type:'json_schema',name:'directions_check',strict:true,schema:directionsSchema}}})})
  const payload=await response.json().catch(()=>({})),grade=response.ok?JSON.parse(outputText(payload)||'null'):null
  if(!grade)throw new Error('directions grade unavailable')
  return grade
}

export const educationAiGradeInternals={directionsSchema,shortSchema,normalize}

export const handler=async event=>{
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  const session=await readSession(event)
  if(!session)return json(401,{error:'Sign in required.'})
  if(!process.env.OPENAI_API_KEY)return json(503,{error:'Brevity AI is not configured.'})
  let body={}
  try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request.'})}
  const exerciseId=String(body.exerciseId||'')
  if(!/^reading-[a-z0-9-]+$/i.test(exerciseId))return json(400,{error:'Choose a valid exercise.'})
  const record=await store().get(`${HOUSEHOLD_ID}/education/exercises/${exerciseId}`,{type:'json'}).catch(()=>null)
  if(!record)return json(404,{error:'Exercise not found.'})

  if(body.mode==='directions'){
    try{
      const result=await gradeDirections(record,String(body.studentSummary||'').slice(0,1600))
      return json(200,{exerciseId,mode:'directions',...result,skill:'following written directions',contentMasteryAffected:false,reviewed:false,evidenceStatus:'draft-adult-review-required'})
    }catch{return json(502,{error:'Brevity could not check the directions explanation. An adult can review it instead.'})}
  }

  const answers=body.answers&&typeof body.answers==='object'&&!Array.isArray(body.answers)?body.answers:{}
  const results=[]
  for(const question of record.questions||[]){
    const answer=String(answers[question.id]||'').trim()
    if(question.type==='multiple_choice'){
      const correct=normalize(answer)===normalize(question.correctAnswer)
      results.push({id:question.id,skill:question.skill,type:question.type,score:correct?1:0,possible:1,correct,feedback:correct?'Correct.':'Review the passage and identify the evidence that supports the answer.'})
      continue
    }
    if(!answer){results.push({id:question.id,skill:question.skill,type:question.type,score:0,possible:2,correct:false,feedback:'No answer was submitted.'});continue}
    try{
      const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:MODEL,store:false,instructions:'Grade a Grade 3 reading response using only the supplied passage, expected answer, and rubric. Be concise and evidence-based.',input:JSON.stringify({passage:record.passage,question:question.prompt,expectedAnswer:question.correctAnswer,rubric:question.rubric,studentAnswer:answer}),text:{format:{type:'json_schema',name:'short_response_grade',strict:true,schema:shortSchema}}})})
      const payload=await response.json().catch(()=>({})),grade=response.ok?JSON.parse(outputText(payload)||'null'):null
      if(!grade)throw new Error('grade unavailable')
      results.push({id:question.id,skill:question.skill,type:question.type,score:grade.score,possible:2,correct:grade.score===2,feedback:grade.feedback,evidence:grade.evidence})
    }catch{results.push({id:question.id,skill:question.skill,type:question.type,score:null,possible:2,correct:null,feedback:'AI grading was unavailable. An adult should review this response.'})}
  }
  const numeric=results.filter(item=>Number.isFinite(item.score)),earned=numeric.reduce((sum,item)=>sum+item.score,0),possible=numeric.reduce((sum,item)=>sum+item.possible,0)
  return json(200,{exerciseId,mode:'content',earned,possible,percent:possible?Math.round(earned/possible*100):null,items:results,reviewed:false,evidenceStatus:'draft-adult-review-required',note:'This grade is draft instructional evidence. Adult-reviewed session completion controls mastery promotion.'})
}
