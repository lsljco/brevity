import householdAuth from './household-auth.js'

const { readSession } = householdAuth
const MODEL = process.env.BREVITY_AI_MODEL || 'gpt-5.6'
const json = (statusCode, body) => ({ statusCode, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}, body:JSON.stringify(body) })
const outputText = response => (response.output||[]).flatMap(item=>item.content||[]).map(part=>part.text||'').join('').trim()

const schema={
  type:'object',additionalProperties:false,
  properties:{
    sermonNotes:{type:'object',additionalProperties:false,properties:{
      title:{type:'string'},scriptures:{type:'array',items:{type:'string'}},themes:{type:'array',items:{type:'string'}},bigIdea:{type:'string'},definition:{type:'string'},coreRevelation:{type:'string'},foundationalTruths:{type:'array',items:{type:'string'}},whatThisProduces:{type:'array',items:{type:'string'}},applicationQuestions:{type:'array',items:{type:'string'}},call:{type:'string'},prayer:{type:'string'}
    },required:['title','scriptures','themes','bigIdea','definition','coreRevelation','foundationalTruths','whatThisProduces','applicationQuestions','call','prayer']},
    formation:{type:'object',additionalProperties:false,properties:{
      scripture:{type:'array',items:{type:'string'}},devotionFocus:{type:'string'},prayerFocus:{type:'array',items:{type:'string'}},discussionPrompts:{type:'array',items:{type:'string'}},obedienceAction:{type:'string'},todayFocus:{type:'string'},keyPrinciple:{type:'string'},formationEmphasis:{type:'string'},weeklyAssignment:{type:'string'}
    },required:['scripture','devotionFocus','prayerFocus','discussionPrompts','obedienceAction','todayFocus','keyPrinciple','formationEmphasis','weeklyAssignment']}
  },required:['sermonNotes','formation']
}

export const handler=async event=>{
  if(event.httpMethod!=='POST') return json(405,{error:'Method not allowed.'})
  if(!process.env.OPENAI_API_KEY) return json(503,{error:'Brevity AI is not configured yet. OPENAI_API_KEY must be available to Netlify Functions.'})
  const session=await readSession(event).catch(()=>null)
  if(!session) return json(401,{error:'Sign in to generate sermon notes and formation.'})

  let body={}
  try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request body.'})}
  const transcript=String(body.transcript||'').trim()
  const sermonDate=String(body.sermonDate||'').trim()
  const serviceType=String(body.serviceType||'').trim()
  const suppliedTitle=String(body.title||'').trim()
  const targetDate=String(body.targetDate||'').trim()
  if(!transcript) return json(400,{error:'A sermon transcript is required.'})
  if(transcript.length>120000) return json(413,{error:'This transcript is too large for one Brevity analysis. Reduce it to 120,000 characters or less.'})

  const prompt=`You are Brevity's Spiritual Maturity formation engine. Lorenzo owns Spiritual Maturity.

SOURCE:
Service: ${serviceType||'Unspecified'}
Sermon date: ${sermonDate||'Unspecified'}
Target daily formation date: ${targetDate||'Today'}
Supplied title: ${suppliedTitle||'None'}

SERMON-NOTE FRAMEWORK — use exactly these eleven sections in the structured output:
1. Title
2. Scriptures
3. Theme(s)
4. Big Idea
5. Definition
6. Core Revelation
7. Foundational Truths
8. What This Produces
9. Application Questions
10. Call
11. Prayer

Preserve the preacher's wording, doctrinal weight, sequence, emphases, bullet logic, and Scripture references as faithfully as the transcript allows. Do not invent quotations, doctrines, stories, Scriptures, definitions, or claims. Normalize transcription noise only where meaning is clear. Do not add a Greeting section.

After establishing the notes, derive the household's daily Spiritual Maturity content from this sermon: Scripture, Devotion Focus, Prayer Focus, Discussion Prompts, Act of Obedience, Today's Focus, Key Principle, Formation Emphasis, and Weekly Assignment. Make every element traceable to the sermon. The formation goal is revelation → responsibility → preparation → execution → fruit → review. Brevity proposes; the household may edit before saving.

TRANSCRIPT:
${transcript}`

  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:MODEL,store:false,input:prompt,text:{format:{type:'json_schema',name:'brevity_sermon_formation',strict:true,schema}}})})
  const payload=await response.json().catch(()=>({}))
  if(!response.ok){
    const message=payload.error?.message||'OpenAI sermon analysis failed.'
    const code=payload.error?.code||payload.error?.type||''
    if(response.status===429&&/quota|billing|insufficient/i.test(`${message} ${code}`)) return json(429,{error:'Brevity AI reached the OpenAI API project’s available quota. Add API credits or increase the project usage limit, then try again.'})
    return json(response.status,{error:message})
  }
  let result
  try{result=JSON.parse(outputText(payload))}catch{return json(502,{error:'Brevity AI returned unreadable sermon formation data.'})}
  return json(200,{generatedAt:new Date().toISOString(),model:MODEL,source:{sermonDate,serviceType,title:suppliedTitle,targetDate},...result})
}
