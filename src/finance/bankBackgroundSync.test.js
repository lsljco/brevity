import test from 'node:test'
import assert from 'node:assert/strict'
import {generateKeyPair,exportJWK,SignJWT} from 'jose'
import {createHash} from 'node:crypto'
import {createBankBackgroundSync,commitBankSource,bankRecordKey,bankHousehold,dispatchBankSync} from '../../netlify/lib/bank-background-sync.mjs'
import {verifyPlaidWebhook,createPlaidWebhookHandler} from '../../netlify/functions/plaid-webhook.mjs'
import {createBankSyncHandler} from '../../netlify/functions/bank-sync-background.mjs'
import household from '../../netlify/legacy-functions/household-state.js'
function memory(){const records=new Map();let revision=0;return{records,get:async k=>structuredClone(records.get(k)?.data??null),getWithMetadata:async k=>structuredClone(records.get(k)??null),setJSON:async(k,data,options={})=>{const old=records.get(k);if(options.onlyIfNew&&old||options.onlyIfMatch&&options.onlyIfMatch!==old?.etag)return{modified:false};records.set(k,{data:structuredClone(data),etag:String(++revision)});return{modified:true}}}}
const now=()=>new Date()
const tokens=[{item_id:'item-1',access_token:'fixture-token',institution:'Test bank'}]
const batch={state:{cursor:'',itemId:'item-1',institution:'Test bank'},pendingDelta:{batchId:'test-batch',nextCursor:'next-1',fromCursor:'',transactions:[{id:'tx-1',accountId:'bank-1',itemId:'item-1',name:'Test purchase',amount:12,date:'2026-10-27',category:'Food',type:'expense',institution:'Test bank',pending:false,pendingTransactionId:null}],removed:[],balanceAccounts:[],createdAt:now().toISOString(),updateStatus:'HISTORICAL_UPDATE_COMPLETE'},receipt:{cursorIdentity:'item-1',batchId:'test-batch'}}
test('background sync persists signed bank sources before acknowledging, preserves plans and uses no paid endpoints',async()=>{
 const old=process.env.BREVITY_SOURCE_RECEIPT_KEY;process.env.BREVITY_SOURCE_RECEIPT_KEY='test-only-bank-signing-key'
 try{
  const dataStore=memory(),statusStore=memory();let ack=0,registered=0
  await dataStore.setJSON(bankRecordKey('lslj_finance_v9'),{key:'lslj_finance_v9',version:1,value:JSON.stringify({accounts:[{id:'a1',name:'Operating Account',type:'checking',plaidAccountId:'bank-1',balance:20}],transactions:[{id:'plan-1',amount:500}]})})
  const client={itemGet:async()=>({data:{item:{webhook:''},status:{transactions:{last_successful_update:'2026-10-26T00:30:00Z'}}}}),accountsGet:async()=>({data:{accounts:[{account_id:'bank-1',name:'Checking',type:'depository',subtype:'checking',balances:{current:100,available:88}}]}}),itemWebhookUpdate:async()=>{registered++}}
  const commit=args=>commitBankSource({...args,write:options=>household.writePlaidSourceRecord({...options,now,verifySourceReceipts:async()=>[batch],acknowledgeSourceReceipt:async()=>{assert.ok(await dataStore.get(bankRecordKey('plaid_actuals_cache')));ack++}})})
  const run=createBankBackgroundSync({client,dataStore,statusStore,getTokens:async()=>tokens,stage:async()=>batch,commit,now,isPreview:false,origin:'https://example.test'})
  const result=await run();assert.equal(result.state,'synced',JSON.stringify(result));assert.equal(ack,1);assert.equal(registered,1)
  const saved=JSON.parse((await dataStore.get(bankRecordKey('lslj_finance_v9'))).value)
  assert.equal(saved.accounts[0].balance,88);assert.deepEqual(saved.transactions,[{id:'plan-1',amount:500}])
  assert.equal(JSON.parse((await dataStore.get(bankRecordKey('plaid_actuals_cache'))).value).length,1)
  assert.equal((await statusStore.get(bankHousehold())).balanceSourceUpdatedAt,'2026-10-26T00:30:00.000Z')
 }finally{if(old===undefined)delete process.env.BREVITY_SOURCE_RECEIPT_KEY;else process.env.BREVITY_SOURCE_RECEIPT_KEY=old}
})
test('source writes retry a conflict against the newest household version',async()=>{
 const dataStore=memory();let writes=0
 const result=await commitBankSource({dataStore,key:'plaid_actuals_cache',derive:prior=>prior||[],write:async()=>++writes===1?{statusCode:200,body:{conflict:true}}:{statusCode:200,body:{unchanged:true}}})
 assert.equal(writes,2);assert.equal(result.unchanged,true)
 await assert.rejects(commitBankSource({dataStore,key:'plaid_actuals_cache',derive:()=>[],write:async()=>({statusCode:200,body:{sourceAcknowledgementPending:true}})}),/did not complete/)
})
test('background sync reports failures, retains an existing webhook, and excludes preview runs',async()=>{
 const statusStore=memory();let calls=0
 const args={dataStore:memory(),statusStore,getTokens:async()=>tokens,stage:async()=>{throw Object.assign(Error('secret must not leak'),{code:'ITEM_LOGIN_REQUIRED'})},client:{itemGet:async()=>({data:{item:{webhook:'https://other.test'},status:{}}})},now,isPreview:false,origin:'https://example.test'}
 const result=await createBankBackgroundSync(args)();assert.equal(result.state,'partial');assert.equal(result.connections[0].transactionError,'ITEM_LOGIN_REQUIRED');assert.equal(result.connections[0].webhook,'existing receiver retained');assert.ok(!JSON.stringify(result).includes('secret must not leak'))
 assert.equal((await createBankBackgroundSync({...args,isPreview:true,getTokens:async()=>{calls++}})()).reason,'preview');assert.equal(calls,0)
})
test('concurrent triggers share a lease; scheduled dispatch is authenticated and never runs in previews',async()=>{
 const statusStore=memory();let called=0
 const run=createBankBackgroundSync({client:{},dataStore:memory(),statusStore,getTokens:async()=>{called++;return[]},now,isPreview:false})
 const results=await Promise.all([run(),run()]);assert.equal(called,1);assert.equal(results.filter(r=>r.skipped).length,1)
 let options;await dispatchBankSync({secret:'fixture-secret',origin:'https://example.test',isPreview:false,fetcher:async(url,o)=>{options=o;assert.equal(new URL(url).pathname,'/.netlify/functions/bank-sync-background');return{ok:true}}});assert.equal(options.headers['x-brevity-automation-key'],'fixture-secret')
 assert.deepEqual(await dispatchBankSync({isPreview:true}),{skipped:true})
 const handler=createBankSyncHandler({secret:()=> 'fixture-secret',run:async()=>{called++}})
 assert.equal((await handler(new Request('https://example.test',{method:'POST'}))).status,401)
})
test('webhook signature verifies the exact body, rejects old or tampered messages and ignores unknown items',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('ES256');const jwk={...await exportJWK(publicKey),kid:'test-key',alg:'ES256',expired_at:null}
 const client={webhookVerificationKeyGet:async()=>({data:{key:jwk}})},raw=JSON.stringify({webhook_type:'TRANSACTIONS',webhook_code:'SYNC_UPDATES_AVAILABLE',item_id:'item-1'})
 const sign=age=>new SignJWT({request_body_sha256:createHash('sha256').update(raw).digest('hex')}).setProtectedHeader({alg:'ES256',kid:'test-key'}).setIssuedAt(Math.floor(now().getTime()/1000)-age).sign(privateKey)
 const jwt=await sign(0);assert.equal((await verifyPlaidWebhook(raw,jwt,{client,now:now()})).item_id,'item-1')
 await assert.rejects(verifyPlaidWebhook(raw+' ',jwt,{client,now:now()}),/mismatch/)
 await assert.rejects(verifyPlaidWebhook(raw,await sign(400),{client,now:now()}))
 let dispatched=0
 const handler=createPlaidWebhookHandler({isPreview:false,verify:(body,token)=>verifyPlaidWebhook(body,token,{client,now:now()}),getTokens:async()=>tokens,dispatch:async()=>{dispatched++}})
 assert.equal((await handler(new Request('https://example.test',{method:'POST',body:raw,headers:{'plaid-verification':jwt}}))).status,200);assert.equal(dispatched,1)
 assert.equal((await handler(new Request('https://example.test',{method:'POST',body:raw}))).status,401);assert.equal(dispatched,1)
 const unknown=createPlaidWebhookHandler({isPreview:false,verify:async()=>JSON.parse(raw),getTokens:async()=>[],dispatch:async()=>{dispatched++}})
 await unknown(new Request('https://example.test',{method:'POST',body:raw}));assert.equal(dispatched,1)
})
test('cached multi-bank snapshots never replace a newer live balance and incomplete snapshots are retained',async()=>{
 const old=process.env.BREVITY_SOURCE_RECEIPT_KEY;process.env.BREVITY_SOURCE_RECEIPT_KEY='test-only-bank-signing-key';try{
 const two=[...tokens,{...tokens[0],item_id:'item-2',access_token:'token-2'}];let accountWrites=0
 const run=missing=>createBankBackgroundSync({statusStore:memory(),dataStore:memory(),getTokens:async()=>two,stage:async()=>({receipt:'test'}),now,isPreview:false,origin:'https://example.test',client:{itemGet:async({access_token})=>({data:{item:{webhook:'https://example.test/.netlify/functions/plaid-webhook'},status:{transactions:{last_successful_update:missing&&access_token==='token-2'?null:'2026-10-25T00:00:00Z'}}}}),accountsGet:async()=>({data:{accounts:[]}})},commit:async args=>{if(args.key==='lslj_finance_v9'){accountWrites++;assert.equal(await args.derive({accounts:[]},{plaidAccountReceipt:{sourceUpdatedAt:now().getTime()}}),null);return{skipped:true}}return{}}})()
 const retained=await run(false);assert.equal(accountWrites,1);assert.ok(retained.connections.every(x=>x.balances==='retained'))
 const partial=await run(true);assert.equal(accountWrites,1);assert.equal(partial.state,'partial');assert.ok(partial.connections.some(x=>x.balanceError==='INCOMPLETE_BANK_SNAPSHOT'))
 }finally{if(old===undefined)delete process.env.BREVITY_SOURCE_RECEIPT_KEY;else process.env.BREVITY_SOURCE_RECEIPT_KEY=old}
})
