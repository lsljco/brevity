import {getStore} from '@netlify/blobs'

const HOUSEHOLD_ID=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family',STORE_NAME='brevity-household',MODEL=process.env.BREVITY_AI_MODEL||'gpt-5.6'
export const HEALTH_ALERT_KEY=`${HOUSEHOLD_ID}/health/public-health-alerts`
const sources=[
  {name:'Fulton County Board of Health news',scope:'Fulton County',url:'https://www.fultoncountyga.gov/news'},
  {name:'Georgia DPH viral respiratory diseases',scope:'Georgia',url:'https://dph.georgia.gov/epidemiology/acute-disease-epidemiology/viral-respiratory-diseases'},
  {name:'Georgia DPH wastewater surveillance',scope:'Georgia',url:'https://dph.georgia.gov/epidemiology/acute-disease-epidemiology/wastewater-surveillance/ga-nwss-wastewater-surveillance'},
  {name:'Georgia DPH influenza activity',scope:'Georgia',url:'https://dph.georgia.gov/flu-activity-georgia'},
  {name:'CDC respiratory illness data',scope:'United States',url:'https://www.cdc.gov/respiratory-viruses/data/'},
  {name:'CDC current foodborne outbreaks',scope:'United States',url:'https://www.cdc.gov/foodborne-outbreaks/outbreaks/'}
]
const store=()=>getStore({name:STORE_NAME,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const textFromHtml=html=>String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim()
const outputText=response=>(response.output||[]).flatMap(item=>item.content||[]).map(item=>item.text||'').join('').trim()
const alertSchema={
  type:'object',additionalProperties:false,
  properties:{
    status:{type:'string',enum:['clear','alert']},summary:{type:'string'},
    alerts:{type:'array',items:{
      type:'object',additionalProperties:false,
      properties:{severity:{type:'string',enum:['watch','important','urgent']},category:{type:'string'},title:{type:'string'},geography:{type:'string'},evidence:{type:'string'},recommendations:{type:'array',items:{type:'string'}},sourceIndexes:{type:'array',items:{type:'integer'}},reportedDate:{type:'string'}},
      required:['severity','category','title','geography','evidence','recommendations','sourceIndexes','reportedDate']
    }}
  },
  required:['status','summary','alerts']
}

export async function refreshHealthAlerts(){
  if(!process.env.OPENAI_API_KEY)throw new Error('Brevity AI is not configured for health monitoring.')
  const checkedAt=new Date().toISOString()
  const gathered=await Promise.all(sources.map(async(source,index)=>{try{const response=await fetch(source.url,{headers:{'user-agent':'Brevity household public-health monitor/1.0'}});if(!response.ok)throw new Error(String(response.status));return {...source,index,text:textFromHtml(await response.text()).slice(0,18000),available:true}}catch(error){console.error('[health-alert source]',source.url,error);return {...source,index,text:'Source temporarily unavailable.',available:false}}}))
  const prompt=`You are Brevity's cautious public-health monitoring analyst for one household in ZIP 30022, Fulton County, Georgia. Today is ${checkedAt.slice(0,10)}.

Review only the official-source extracts below. Return an alert only for a CURRENT and ACTIONABLE condition: a local Fulton/metro Atlanta signal; a meaningful Georgia increase or official warning; a CDC respiratory level/trend at moderate or higher relevant to Georgia; or a current national foodborne outbreak/recall with a named product or exposure a Georgia household can act on. Do not alert merely because CDC lists background investigation counts, old notices, routine surveillance, low/very-low activity, or a page mentions a disease historically. Prefer source publication/report dates within 45 days, except a still-active named recall/outbreak.

For respiratory spikes, recommend proportionate layered prevention. You may recommend that eligible household members check whether they are current on CDC-recommended COVID-19 or seasonal flu vaccination and discuss timing/eligibility with their clinician or pharmacist. Never claim an individual is eligible, prescribe treatment, diagnose, or replace medical care. For urgent symptoms, recommend contacting a clinician or emergency services as appropriate. For foodborne alerts, name the implicated food/product only when the source does and give the official avoid/discard/check action.

If no threshold is met, status must be clear and alerts empty. Every alert must cite valid sourceIndexes. Do not infer Fulton County conditions from national data alone.

OFFICIAL SOURCES:
${gathered.map(item=>`SOURCE ${item.index} | ${item.name} | ${item.scope} | ${item.url}\n${item.text}`).join('\n\n')}`
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:MODEL,store:false,input:prompt,max_output_tokens:5000,text:{format:{type:'json_schema',name:'family_public_health_alerts',strict:true,schema:alertSchema}}})})
  const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error?.message||`Health alert analysis returned ${response.status}.`)
  const result=JSON.parse(outputText(payload)),alerts=(result.alerts||[]).map(alert=>({...alert,sources:[...new Set(alert.sourceIndexes)].map(index=>gathered[index]).filter(Boolean).map(({name,scope,url})=>({name,scope,url}))}))
  const record={status:alerts.length?'alert':'clear',summary:result.summary,alerts,geography:{zip:'30022',county:'Fulton County',state:'Georgia'},checkedAt,nextScheduledCheck:'Daily',sourceStatus:gathered.map(({name,scope,url,available})=>({name,scope,url,available}))}
  await store().setJSON(HEALTH_ALERT_KEY,record);return record
}
export async function getHealthAlerts(){return store().get(HEALTH_ALERT_KEY,{type:'json'}).catch(()=>null)}
