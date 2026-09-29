import {createHash} from 'node:crypto'
import {getStore} from './scoped-store.cjs'
import build from './release-build-context.mjs'

const DAY=86400000
export const CONVERSATION_RETENTION_DAYS=30
const conflict=()=>Object.assign(Error('This conversation changed on another device. Refresh the conversation and try again.'),{status:409})
export function createConversationRepository({store,householdId='lslj-family',now=()=>new Date()}){
  const key=member=>{if(!member||typeof member!=='string')throw Error('An authenticated member is required.');return `conversation/${createHash('sha256').update(JSON.stringify([householdId,member])).digest('hex')}`}
  const clean=messages=>(Array.isArray(messages)?messages:[]).filter(m=>['user','assistant'].includes(m?.role)&&typeof m.content==='string'&&m.content.trim()).slice(-60).map(m=>({role:m.role,content:m.content.slice(0,6000),createdAt:m.createdAt||now().toISOString(),...(m.role==='assistant'&&m.proposal?{proposal:m.proposal}:{})}))
  const visible=value=>({...value,messages:clean(value?.messages).filter(m=>Date.parse(m.createdAt)>now().getTime()-30*DAY),version:value?.version||0,canRestore:Boolean(value?.archive&&Date.parse(value.archive.expiresAt)>now().getTime()),retentionDays:30})
  const readEntry=async member=>{const entry=await store.getWithMetadata(key(member),{type:'json'});return {entry,current:visible(entry?.data||{messages:[],version:0})}}
  const publicValue=value=>{const {archive,lastTurnId,...rest}=visible(value);return rest}
  const mutate=async(member,version,update)=>{
    const {entry,current}=await readEntry(member)
    if(!Number.isInteger(version)||version!==current.version)throw conflict()
    const next={...update(current),version:version+1,updatedAt:now().toISOString()}
    if(next.archive&&Date.parse(next.archive.expiresAt)<=now().getTime())delete next.archive
    const result=await store.setJSON(key(member),next,entry?{onlyIfMatch:entry.etag}:{onlyIfNew:true})
    if(result?.modified===false)throw conflict()
    return publicValue(next)
  }
  return {
    read:async member=>publicValue((await readEntry(member)).current),
    async appendTurn(member,{version,turnId,user,assistant,seed=[]}){
      const {current}=await readEntry(member)
      if(current.lastTurnId===turnId)return publicValue(current)
      if(!turnId||user?.role!=='user'||assistant?.role!=='assistant')throw Error('A completed conversation turn is required.')
      return mutate(member,version,value=>({...value,lastTurnId:turnId,messages:clean([...(value.messages.length?value.messages:version===0?clean(seed).map(({role,content,createdAt})=>({role,content,createdAt})):[]),user,assistant])}))
    },
    clear:(member,version)=>mutate(member,version,value=>({messages:[],archive:{messages:value.messages,expiresAt:new Date(now().getTime()+7*DAY).toISOString()}})),
    restore:(member,version)=>mutate(member,version,value=>{if(!value.canRestore)throw Error('No recently cleared conversation is available.');if(value.messages.length)throw Error('Restore before starting a new conversation.');return {messages:value.archive.messages}}),
    async prune(member){const {current}=await readEntry(member);return mutate(member,current.version,value=>value)},
  }
}
export const conversationStore=()=>getStore({name:build.preview?'brevity-preview-conversations':'brevity-conversations',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
export const productionConversationRepository=()=>createConversationRepository({store:conversationStore(),householdId:process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'})

export async function pruneConversationStore(store,now=new Date()){
  let pruned=0
  for await(const page of store.list({prefix:'conversation/',paginate:true}))for(const blob of page.blobs){
    const entry=await store.getWithMetadata(blob.key,{type:'json'})
    if(!entry?.data||!entry.etag)continue
    const value=entry.data,messages=(value.messages||[]).filter(m=>Date.parse(m.createdAt)>now.getTime()-30*DAY)
    const archiveExpired=value.archive&&Date.parse(value.archive.expiresAt)<=now.getTime()
    if(messages.length===(value.messages||[]).length&&!archiveExpired)continue
    const next={...value,messages,version:(value.version||0)+1,updatedAt:now.toISOString()}
    if(archiveExpired)delete next.archive
    const result=await store.setJSON(blob.key,next,{onlyIfMatch:entry.etag})
    if(result?.modified!==false)pruned++
  }
  return {pruned}
}
