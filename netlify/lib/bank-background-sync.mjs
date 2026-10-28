import './native-runtime.mjs'
import {randomUUID} from 'node:crypto'
import {Configuration,PlaidApi,PlaidEnvironments} from 'plaid'
import {getStore,preview} from './scoped-store.mjs'
import storage from '../legacy-functions/storage.js'
import transactions from '../legacy-functions/plaid-transactions.js'
import household from '../legacy-functions/household-state.js'
import accountSource from './plaid-account-source.cjs'
import cost from './plaid-cost-control.cjs'

export const bankHousehold=()=>process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
export const bankStore=name=>getStore({name,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
export const bankClient=()=>new PlaidApi(new Configuration({basePath:PlaidEnvironments[process.env.PLAID_ENV||'sandbox'],baseOptions:{headers:{'PLAID-CLIENT-ID':process.env.PLAID_CLIENT_ID,'PLAID-SECRET':process.env.PLAID_SECRET}}}))
export const bankOrigin=()=>process.env.URL||'https://brevityoflife.netlify.app'
export const bankRecordKey=key=>`${bankHousehold()}/records/${key}`
export function sourceHash(value){let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}return(hash>>>0).toString(16)}
const service={member:'Brevity automatic bank sync',role:'admin'}
const failureCode=error=>String(error?.response?.data?.error_code||error?.code||'SYNC_UNAVAILABLE').slice(0,80)

// Reuse the exact same signed receipts, version checks and durable-before-ack
// source ingestion as manual sync. Never give a public request a service role.
export async function commitBankSource({dataStore,key,derive,proof={},write=household.writePlaidSourceRecord}){
 for(let attempt=0;attempt<3;attempt++){
  const record=await dataStore.get(bankRecordKey(key),{type:'json'})
  const prior=record?.value?JSON.parse(record.value):null
  const candidate=await derive(prior,record)
  if(candidate===null)return{skipped:true}
  const value=JSON.stringify(candidate)
  const result=await write({dataStore,session:service,event:{},body:{key,value,hash:sourceHash(value),expectedVersion:record?.version||0,source:'plaid',writeMode:'source-ingestion',...proof}})
  if(result.body?.conflict)continue
  if(result.statusCode!==200||result.body?.sourceAcknowledgementPending||result.body?.error)throw Object.assign(Error('Bank source import did not complete.'),{code:result.body?.code||'SOURCE_IMPORT_PENDING'})
  return result.body
 }
 throw Object.assign(Error('Household data changed during bank sync.'),{code:'SOURCE_CONFLICT'})
}

export function createBankBackgroundSync({client=null,dataStore=null,statusStore=null,getTokens=storage.getTokens,stage=transactions.syncAndStageItem,commit=commitBankSource,now=()=>new Date(),isPreview=preview,origin=bankOrigin()}={}){
 return async()=>{
  if(isPreview)return{skipped:true,reason:'preview'}
  const statuses=statusStore||bankStore('brevity-bank-sync'),key=bankHousehold()
  const entry=await statuses.getWithMetadata(key,{type:'json'}),previous=entry?.data||{}
  if(previous.runningUntil>now().getTime())return{skipped:true,reason:'already-running'}
  if(entry?.data&&!entry.etag)throw Error('Bank synchronization lease is unavailable.')
  const runId=randomUUID(),startedAt=now().toISOString()
  const claim=await statuses.setJSON(key,{...previous,runId,startedAt,runningUntil:now().getTime()+5*60_000,state:'running'},entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true})
  if(claim?.modified===false)return{skipped:true,reason:'already-running'}
  let report={state:'error',startedAt,checkedAt:startedAt,connections:[],errors:[]}
  try{
   const api=client||bankClient(),records=dataStore||bankStore('brevity-household-state')
   const tokens=cost.uniqueConnections(await getTokens({})||[])
   const cachedAccounts=[],updateTimes=[]
   const webhook=new URL('/.netlify/functions/plaid-webhook',origin)
   if(webhook.protocol!=='https:')throw Error('Secure bank webhook origin required.')
   for(const token of tokens){
    const item={institution:token.institution||'Connected bank',transactions:'error',balances:'error',webhook:'unavailable'}
    // One institution failing does not stop other institutions or balance reads.
    try{
     const batch=await stage({client:api,accessToken:token.access_token,itemId:token.item_id,institution:token.institution,event:{}})
     await commit({dataStore:records,key:'plaid_actuals_cache',derive:prior=>household.applyStagedTransactionBatches(prior,[batch]),proof:{sourceReceipts:[batch.receipt]}})
     item.transactions='synced';item.transactionsImportedAt=now().toISOString()
    }catch(error){item.transactionError=failureCode(error)}
    try{
     const metadata=await api.itemGet({access_token:token.access_token},{timeout:10000})
     const updatedAt=Date.parse(metadata.data.status?.transactions?.last_successful_update||'')
     if(Number.isFinite(updatedAt)&&updatedAt>0&&updatedAt<=now().getTime()){
      item.bankUpdatedAt=new Date(updatedAt).toISOString()
      const response=await api.accountsGet({access_token:token.access_token},{timeout:10000})
      const accounts=response.data.accounts.map(a=>({accountId:a.account_id,itemId:token.item_id,name:a.name,officialName:a.official_name,type:a.type,subtype:a.subtype,mask:a.mask,...accountSource.normalizePlaidAccountBalances(a),institution:token.institution}))
      cachedAccounts.push(...accounts);updateTimes.push(updatedAt);item.balances='pending'
     }else{item.balances='unverified';item.balanceError='BANK_UPDATE_TIME_UNAVAILABLE'}
     const existing=metadata.data.item?.webhook
     if(!existing){await api.itemWebhookUpdate({access_token:token.access_token,webhook:webhook.href},{timeout:10000});item.webhook='registered'}
     else item.webhook=existing===webhook.href?'registered':'existing receiver retained'
    }catch(error){item.balanceError=failureCode(error)}
    report.connections.push(item)
   }
   if(tokens.length&&updateTimes.length===tokens.length){
    try{
     const sourceUpdatedAt=Math.min(...updateTimes)
     const receipt=accountSource.createAccountSourceReceipt(cachedAccounts,{balanceMode:'cached',sourceUpdatedAt,now})
     const result=await commit({dataStore:records,key:'lslj_finance_v9',derive:(prior,record)=>{
      if(!prior)throw Object.assign(Error('Finance plan missing.'),{code:'FINANCE_PLAN_MISSING'})
      const watermark=record?.plaidAccountReceipt,priorTime=Number(watermark?.sourceUpdatedAt??watermark?.issuedAt)||0
      if(sourceUpdatedAt<=priorTime)return null
      return accountSource.mergeVerifiedPlaidBalances(prior,cachedAccounts)
     },proof:{accountSourceReceipt:receipt}})
     report.connections.forEach(item=>{item.balances=result.skipped?'retained':'synced'})
     report.balanceSourceUpdatedAt=new Date(sourceUpdatedAt).toISOString()
    }catch(error){report.connections.forEach(item=>{item.balances='error';item.balanceError=failureCode(error)})}
   }else report.connections.forEach(item=>{if(item.balances==='pending'){item.balances='retained';item.balanceError='INCOMPLETE_BANK_SNAPSHOT'}})
   report.state=!tokens.length?'disconnected':report.connections.every(x=>x.transactions==='synced'&&!x.balanceError&&['synced','retained'].includes(x.balances))?'synced':'partial'
  }catch(error){report.errors.push(failureCode(error))}
  report.checkedAt=now().toISOString()
  const latest=await statuses.getWithMetadata(key,{type:'json'})
  if(latest?.data?.runId===runId&&latest.etag)await statuses.setJSON(key,{...report,runId,runningUntil:0,...(report.state==='synced'?{lastSuccessfulAt:report.checkedAt}:{lastSuccessfulAt:previous.lastSuccessfulAt||null})},{onlyIfMatch:latest.etag})
  return report
 }
}

export async function dispatchBankSync({fetcher=fetch,secret=process.env.BREVITY_AUTOMATION_KEY,origin=bankOrigin(),isPreview=preview}={}){
 if(isPreview)return{skipped:true}
 if(!secret)throw Error('Automatic bank sync requires the existing automation credential.')
 const url=new URL('/.netlify/functions/bank-sync-background',origin)
 if(url.protocol!=='https:')throw Error('Secure bank sync origin required.')
 const response=await fetcher(url,{method:'POST',headers:{'x-brevity-automation-key':secret},signal:AbortSignal.timeout(10000)})
 if(!response.ok)throw Error('Automatic bank sync could not be queued.')
 return{queued:true}
}
