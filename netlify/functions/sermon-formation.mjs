import householdAuth from './household-auth.js'

const { readSession } = householdAuth
const MODEL = process.env.BREVITY_AI_MODEL || 'gpt-5.6'
const SINGLE_ANALYSIS_LIMIT = 120000
const MAX_TRANSCRIPT_LENGTH = 600000
const TRANSCRIPT_CHUNK_SIZE = 90000
const json = (statusCode, body) => ({ statusCode, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}, body:JSON.stringify(body) })
const outputText = response => (response.output||[]).flatMap(item=>item.content||[]).map(part=>part.text||'').join('').trim()

const splitTranscript=(text,size=TRANSCRIPT_CHUNK_SIZE)=>{
  const chunks=[]
  let remaining=text.trim()
  while(remaining.length>size){
    const window=remaining.slice(0,size)
    const paragraph=window.lastIndexOf('\n\n')
    const line=window.lastIndexOf('\n')
    const sentence=Math.max(window.lastIndexOf('. '),window.lastIndexOf('? '),window.lastIndexOf('! '))
    const boundary=Math.max(paragraph,line,sentence)
    const cut=boundary>size*.6?boundary+(boundary===sentence?1:0):size
    chunks.push(remaining.slice(0,cut).trim())
    remaining=remaining.slice(cut).trim()
  }
  if(remaining)chunks.push(remaining)
  return chunks
}

const requestOpenAI=async body=>{
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:MODEL,store:false,...body})})
  const payload=await response.json().catch(()=>({}))
  if(!response.ok){
    const message=payload.error?.message||'OpenAI sermon analysis failed.'
    const code=payload.error?.code||payload.error?.type||''
    const error=new Error(response.status===429&&/quota|billing|insufficient/i.test(`${message} ${code}`)?'Brevity AI reached the OpenAI API project’s available quota. Add API credits or increase the project usage limit, then try again.':message)
    error.status=response.status
    throw error
  }
  return payload
}

const analyzeTranscriptChunks=async transcript=>{
  const chunks=splitTranscript(transcript)
  const analyses=await Promise.all(chunks.map(async(chunk,index)=>{
    const prompt=`You are preparing source-faithful notes for section ${index+1} of ${chunks.length} of one sermon transcript. Produce a detailed ordered source digest for a later synthesis. Preserve every teaching movement, doctrinal claim, Scripture reference and its stated use, illustration, definition, framework, application, congregational response, prayer element, and distinctive phrase. Include a small number of exact quotations only when traceable to this section. Do not summarize into generic themes, invent content, or write the final sermon document. Clearly mark where a thought begins or ends mid-section.\n\nTRANSCRIPT SECTION ${index+1} OF ${chunks.length}:\n${chunk}`
    const payload=await requestOpenAI({input:prompt,max_output_tokens:8000})
    return `SECTION ${index+1} OF ${chunks.length}\n${outputText(payload)}`
  }))
  return analyses.join('\n\n')
}

const scriptureItem={type:'object',additionalProperties:false,properties:{reference:{type:'string'},explanation:{type:'string'}},required:['reference','explanation']}
const teachingSection={type:'object',additionalProperties:false,properties:{title:{type:'string'},paragraphs:{type:'array',items:{type:'string'}},quotes:{type:'array',items:{type:'string'}}},required:['title','paragraphs','quotes']}
const frameworkSection={type:'object',additionalProperties:false,properties:{title:{type:'string'},description:{type:'string'},items:{type:'array',items:{type:'object',additionalProperties:false,properties:{label:{type:'string'},detail:{type:'string'}},required:['label','detail']}}},required:['title','description','items']}
const applicationSection={type:'object',additionalProperties:false,properties:{title:{type:'string'},paragraphs:{type:'array',items:{type:'string'}},steps:{type:'array',items:{type:'string'}}},required:['title','paragraphs','steps']}
const schema={
  type:'object',additionalProperties:false,
  properties:{
    sermonNotes:{type:'object',additionalProperties:false,properties:{
      documentTitle:{type:'string'},series:{type:'string'},part:{type:'string'},subtitle:{type:'string'},preacherTeacher:{type:'string'},service:{type:'string'},sermonDate:{type:'string'},preparedFor:{type:'string'},leadQuote:{type:'string'},aim:{type:'string'},thesis:{type:'string'},openingExhortation:{type:'array',items:{type:'string'}},primaryScriptures:{type:'array',items:scriptureItem},supportingBiblicalWitnesses:{type:'array',items:scriptureItem},governingQuestion:{type:'string'},historicalBiblicalContext:{type:'array',items:teachingSection},detailedExposition:{type:'array',items:teachingSection},kingdomPrinciples:{type:'array',items:{type:'string'}},architecturalFrameworks:{type:'array',items:frameworkSection},practicalApplication:{type:'array',items:applicationSection},reflectionQuestions:{type:'array',items:{type:'string'}},weeklyCharge:{type:'object',additionalProperties:false,properties:{title:{type:'string'},paragraphs:{type:'array',items:{type:'string'}},actions:{type:'array',items:{type:'string'}},quote:{type:'string'}},required:['title','paragraphs','actions','quote']},congregationalResponse:{type:'array',items:{type:'string'}},prayer:{type:'array',items:{type:'string'}},scriptureIndex:{type:'array',items:{type:'object',additionalProperties:false,properties:{reference:{type:'string'},teachingEmphasis:{type:'string'}},required:['reference','teachingEmphasis']}}
    },required:['documentTitle','series','part','subtitle','preacherTeacher','service','sermonDate','preparedFor','leadQuote','aim','thesis','openingExhortation','primaryScriptures','supportingBiblicalWitnesses','governingQuestion','historicalBiblicalContext','detailedExposition','kingdomPrinciples','architecturalFrameworks','practicalApplication','reflectionQuestions','weeklyCharge','congregationalResponse','prayer','scriptureIndex']},
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
  if(transcript.length>MAX_TRANSCRIPT_LENGTH) return json(413,{error:'This transcript exceeds Brevity’s 600,000-character upload capacity. Please remove non-sermon material or split it into two services.'})

  let analysisSource=transcript
  let sourceLabel='TRANSCRIPT'
  if(transcript.length>SINGLE_ANALYSIS_LIMIT){
    try{analysisSource=await analyzeTranscriptChunks(transcript);sourceLabel='ORDERED SOURCE DIGESTS FROM THE COMPLETE TRANSCRIPT'}
    catch(error){return json(error.status||502,{error:error.message||'Brevity could not analyze the transcript sections.'})}
  }

  const prompt=`You are Brevity's Spiritual Maturity formation engine. Lorenzo owns Spiritual Maturity.

SOURCE:
Service: ${serviceType||'Unspecified'}
Sermon date: ${sermonDate||'Unspecified'}
Target daily formation date: ${targetDate||'Today'}
Supplied title: ${suppliedTitle||'None'}

SERMON-NOTE STANDARD — create a permanent Church Triumphant teaching document with the depth and organization of the household's approved reference, "The Architecture of Wisdom — The Breakdown Point Between Hearing and Doing". Use every structured section in the schema:
- Complete title-page metadata and one exact lead quotation from the transcript.
- Aim and thesis written as substantive, precise paragraphs.
- Opening exhortation with multiple developed paragraphs.
- Primary Scriptures and supporting biblical witnesses, each with an explanation of its role in the teaching.
- A governing question.
- Historical and biblical context divided into titled, developed subsections.
- Detailed exposition divided into sequentially numbered teaching movements. Capture every major movement in the transcript; do not compress a full sermon into a short generic summary. Each movement needs developed paragraphs and any exact supporting quotations.
- Kingdom principles as complete propositions.
- Architectural frameworks that name the model and explain each stage or component.
- Practical application with audits, diagnostic questions, concrete steps, and Seven Pillars connections when present in the source.
- Reflection questions, weekly charge, congregational response, full prayer, and Scripture index with teaching emphasis.

Preserve the preacher's wording, doctrinal weight, sequence, emphases, illustrations, bullet logic, and Scripture references as faithfully as the transcript allows. Notes must be detailed enough to function as the permanent teaching record—not an outline, synopsis, or collection of generic cards. Do not invent quotations, doctrines, stories, Scriptures, definitions, or claims. Only place text in quotation fields when it is traceable to the transcript. Normalize transcription noise only where meaning is clear. Do not add a Greeting section.

After establishing the notes, derive the household's daily Spiritual Maturity content from this sermon: Scripture, Devotion Focus, Prayer Focus, Discussion Prompts, Act of Obedience, Today's Focus, Key Principle, Formation Emphasis, and Weekly Assignment. Make every element traceable to the sermon. The formation goal is revelation → responsibility → preparation → execution → fruit → review. Brevity proposes; the household may edit before saving.

${sourceLabel}:
${analysisSource}`

  let payload
  try{payload=await requestOpenAI({input:prompt,max_output_tokens:50000,text:{format:{type:'json_schema',name:'brevity_sermon_formation',strict:true,schema}}})}
  catch(error){return json(error.status||502,{error:error.message||'OpenAI sermon analysis failed.'})}
  let result
  try{result=JSON.parse(outputText(payload))}catch{return json(502,{error:'Brevity AI returned unreadable sermon formation data.'})}
  return json(200,{generatedAt:new Date().toISOString(),model:MODEL,source:{sermonDate,serviceType,title:suppliedTitle,targetDate,transcriptSections:transcript.length>SINGLE_ANALYSIS_LIMIT?splitTranscript(transcript).length:1},...result})
}
