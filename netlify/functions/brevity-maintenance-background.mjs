import {getStore} from '../lib/scoped-store.mjs'
import {verifyMaintenanceRequest} from '../lib/maintenance-dispatch.mjs'
import {createHouseholdBackup,backupStore,pruneHouseholdBackups} from '../lib/household-backup.mjs'
import {conversationStore,pruneConversationStore} from '../lib/assistant-conversation-store.mjs'
import {usageStore,pruneUsageStore} from '../lib/usage-metrics.mjs'
const store=name=>getStore({name,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
export default async request=>{
 const body=await request.text()
 if(!verifyMaintenanceRequest({body,time:request.headers.get('x-brevity-time'),proof:request.headers.get('x-brevity-proof'),key:process.env.NETLIFY_TOKEN}))return new Response('Unauthorized',{status:401})
 let value;try{value=JSON.parse(body)}catch{return new Response('Invalid request',{status:400})}
 if(!/^[a-f0-9-]{36}$/.test(value.id||'')||!['backup','retention'].includes(value.job))return new Response('Invalid job',{status:400})
 const receipts=store('brevity-maintenance-jobs'),claimed=await receipts.setJSON(value.id,{state:'running',job:value.job,createdAt:new Date().toISOString()},{onlyIfNew:true})
 if(claimed?.modified===false)return new Response(null,{status:202})
 try{
  if(value.job==='backup'){
   const manifest=await createHouseholdBackup()
   if(manifest.state!=='complete')throw Error('Household backup incomplete.')
   await pruneHouseholdBackups(backupStore('brevity-recovery'))
  }else{
   await pruneConversationStore(conversationStore());await pruneUsageStore(usageStore())
   const jobs=store('brevity-assistant-jobs')
   for await(const page of jobs.list({prefix:'job-',paginate:true}))for(const item of page.blobs){const record=await jobs.get(item.key,{type:'json'});if(record?.createdAt&&Date.parse(record.createdAt)<Date.now()-86400000)await jobs.delete(item.key)}
  }
  await receipts.setJSON(value.id,{state:'complete',job:value.job,completedAt:new Date().toISOString()})
 }catch(error){await receipts.setJSON(value.id,{state:'failed',job:value.job,failedAt:new Date().toISOString()});throw error}
 return new Response(null,{status:202})
}
export const config={background:true}
