import {getStore} from '../lib/scoped-store.cjs'
import {usageStore,pruneUsageStore} from '../lib/usage-metrics.mjs'
import {conversationStore,pruneConversationStore} from '../lib/assistant-conversation-store.mjs'
export default async()=>{await pruneConversationStore(conversationStore());await pruneUsageStore(usageStore());const jobs=getStore({name:'brevity-assistant-jobs',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN});for await(const page of jobs.list({prefix:'job-',paginate:true}))for(const item of page.blobs){const record=await jobs.get(item.key,{type:'json'});if(record?.createdAt&&Date.parse(record.createdAt)<Date.now()-86400000)await jobs.delete(item.key)}}
export const config={schedule:'35 8 * * *'}
