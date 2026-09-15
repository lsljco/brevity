import householdAuth from './household-auth.js'

const { readSession } = householdAuth
const MODEL = process.env.BREVITY_AI_MODEL || 'gpt-5.6'
const MAX_TRANSCRIPT = 120000
const json = (statusCode, body) => ({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)})
const outputText = response => (response.output || []).flatMap(item => item.content || []).map(part => part.text || '').join('').trim()
const stripFence = value => String(value||'').replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim()

export const handler = async event => {
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  if(!process.env.OPENAI_API_KEY)return json(503,{error:'Brevity alignment intelligence is not configured yet.'})
  const session=await readSession(event).catch(()=>null)
  if(!session)return json(401,{error:'Sign in to analyze an alignment meeting.'})
  let body={}
  try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request body.'})}
  const transcript=String(body.transcript||'').trim().slice(0,MAX_TRANSCRIPT)
  if(!transcript)return json(400,{error:'An alignment transcript is required.'})
  const timing=body.timing==='today'?'today':'tomorrow'
  const plan=JSON.stringify(body.plan||{}).slice(0,24000)
  const notes=String(body.notes||'').slice(0,8000)
  const prompt=`You are Brevity's Seven Pillars Alignment reconciliation engine. Analyze a household meeting for ${timing} and return ONLY valid JSON.

Rules:
1. Extract only details actually stated. Never invent meals, owners, times, dollar amounts, scripture, decisions, or commitments.
2. Preserve human authority. Your output is a proposed local draft and does not change the shared plan.
3. Organize proposals under the correct Seven Pillars field. Omit unknown values using empty strings or arrays.
4. Times must use 24-hour HH:MM. participants may contain only Larry, Lorenzo, Terica, Nyla, Javin, or Isaiah.
5. Keep current valid plan values unless the conversation clearly replaces them. The client applies only non-empty proposed values.
6. Finance speech is proposed planning information only; never claim bank data changed.
7. Put ambiguity into unresolved rather than guessing.

Return exactly:
{"summary":"concise paragraph","unresolved":["..."],"changes":{"spiritual":{"scripture":[],"devotionFocus":"","prayerFocus":[],"obedienceAction":""},"health":{"breakfast":"","lunch":"","dinner":"","snacks":"","hydration":"","groceries":[],"nextDayPrep":""},"fitness":{"location":"","participants":[],"workout":"","objective":"","departureTime":"","returnTime":"","stepGoal":0,"recovery":""},"household":{"priorities":[],"errands":[],"openItems":[]},"education":{"thinkTankTopic":"","thinkTankDeliverable":"","isaiahNotes":""},"finance":{"bills":[],"purchases":[],"transfers":[],"accountsToFund":[],"decisionRule":""},"ministry":{"contentFocus":"","fellowshipFollowUps":[],"prayerNeeds":[]}}}

Current ${timing} plan: ${plan}
Meeting notes: ${notes||'none'}
TRANSCRIPT:
${transcript}`
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:MODEL,store:false,input:prompt,max_output_tokens:4500})})
  const payload=await response.json().catch(()=>({}))
  if(!response.ok)return json(response.status,{error:payload.error?.message||'Brevity could not reconcile the alignment meeting.'})
  let parsed
  try{parsed=JSON.parse(stripFence(outputText(payload)))}catch{return json(502,{error:'Brevity returned an invalid alignment reconciliation. Please try again.'})}
  return json(200,{...parsed,model:MODEL,member:session.member,analyzedAt:new Date().toISOString()})
}
