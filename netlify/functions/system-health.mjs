import householdAuth from './household-auth.js'
import storage from './storage.js'
import { getOneDriveRepositoryState, oneDriveConfigured } from '../lib/onedrive.mjs'
const {getTokens}=storage,{readSession}=householdAuth
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)})
const status=(state,detail='')=>({state,detail})
export async function buildSystemHealth(event={}){
  const checks={}
  checks.ai=process.env.OPENAI_API_KEY?status('ready','Brevity AI is configured.'):status('needs-attention','OpenAI configuration is missing.')
  checks.calendar=process.env.ICLOUD_EMAIL&&process.env.ICLOUD_APP_PASSWORD?status('ready','Apple Calendar credentials are configured.'):status('needs-attention','Apple Calendar credentials are incomplete.')
  checks.dailyPlan=process.env.BREVITY_AUTOMATION_KEY?status('ready','Scheduled household-plan automation is configured.'):status('needs-attention','Daily-plan automation key is missing.')
  try{const tokens=await getTokens(event);checks.finance=Array.isArray(tokens)&&tokens.length?status('ready',`${tokens.length} Plaid connection${tokens.length===1?'':'s'} stored.`):status('needs-attention','No Plaid connections are stored.')}catch(error){checks.finance=status('needs-attention',error.message||'Plaid token storage is unavailable.')}
  try{const repository=await getOneDriveRepositoryState();checks.oneDrive=!oneDriveConfigured()?status('needs-attention','OneDrive publishing is not configured.'):repository.connection?status('ready',`Connected to ${repository.connection.account||'Microsoft account'}.`):repository.changeRequired?status('needs-attention','OneDrive is connected to an outdated repository target.'):status('needs-attention','OneDrive authorization is required.')}catch(error){checks.oneDrive=status('needs-attention',error.message||'OneDrive state could not be read.')}
  const healthy=Object.values(checks).every(check=>check.state==='ready')
  return{healthy,checks,checkedAt:new Date().toISOString()}
}
export const handler=async event=>{if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed.'});const session=await readSession(event).catch(()=>null);if(!session)return json(401,{error:'Sign in to view Brevity system health.'});return json(200,await buildSystemHealth(event))}
