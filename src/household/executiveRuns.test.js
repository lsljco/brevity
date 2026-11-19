import test from 'node:test'
import assert from 'node:assert/strict'
import {createExecutiveRunRepository,executeExecutiveCycle,automationAuthorized,validateExecutiveResult,loadExecutiveContext,boundedExecutiveContext} from '../../netlify/lib/executive-runs.mjs'
import {issueExecutiveIdentity,verifyExecutiveIdentity} from '../../netlify/lib/executive-identities.mjs'
import {createExecutiveCyclesHandler} from '../../netlify/functions/executive-cycles.mjs'
import {runScheduledExecutiveCycle} from '../../netlify/functions/executive-cycle-scheduled.mjs'
const secret='a-long-test-only-signing-secret-123456789'
const result={status:'ready',summary:'Prepare source-dated options',evidence:['Saved records'],gaps:['No current bank statement'],recommendation:'Request the missing statement',proposedOwner:'Larry (proposed)',nextStep:'Larry reviews the proposal'}
function fixture(){
 const entries=new Map();let n=0,clock=new Date('2026-11-19T08:15:00Z')
 const now=()=>clock
 const store={async get(key){return structuredClone(entries.get(key)?.data||null)},async getWithMetadata(key){return structuredClone(entries.get(key)||null)},async list({prefix}){return {blobs:[...entries.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}},async setJSON(key,data,options={}){const old=entries.get(key);if(options.onlyIfNew&&old||options.onlyIfMatch&&old?.etag!==options.onlyIfMatch)return {modified:false};entries.set(key,{data:structuredClone(data),etag:String(++n)});return {modified:true}}}
 return {repo:createExecutiveRunRepository({store,now}),entries,now,advance:ms=>{clock=new Date(+clock+ms)}}
}
const canonical={householdDate:'2026-11-19',access:{finance:true},sources:[{id:'shared-action-records',state:'available',asOf:'unknown'}],dailyPlan:{topPriorities:['Review plan']},actionRecords:{finance:{budgets:{privateFinance:100}},projects:[]}}
const setup=(repo,now,generate)=>({repository:repo,now,secret,household:'family',loadContext:async()=>canonical,financeReader:async()=>({state:'available',totals:{netCashMovement:50},rows:[{privateRow:1}]}),generate:generate|| (async()=>({result,model:'fixture',responseId:'fixture-response'}))})
test('worker credentials reject forged, expired, wrong-role, wrong-household, wrong-run and revoked identities',async()=>{
 const claims={secret,role:'cfo',epoch:1,runId:'r1',household:'family',now:new Date('2026-11-19T08:00:00Z')}
 const token=await issueExecutiveIdentity(claims)
 assert.equal((await verifyExecutiveIdentity(token,claims)).id,'executive:cfo')
 for(const overrides of [{role:'coo'},{household:'other'},{runId:'r2'},{epoch:2},{now:new Date('2026-11-19T08:05:00Z')}])await assert.rejects(verifyExecutiveIdentity(token,{...claims,...overrides}),{status:403})
 await assert.rejects(verifyExecutiveIdentity(token+'forged',claims),{status:403})
 assert.equal(automationAuthorized('abc','abcd'),false);assert.equal(automationAuthorized(secret,secret),true)
})
test('four-stage cycle saves attributed receipts with scoped context and no source write capabilities',async()=>{
 const {repo,now}=fixture();await repo.create({id:'run1',member:'Larry'})
 const inputs=[]
 const generate=async args=>{inputs.push(args);return {result,model:'fixture'}}
 assert.equal((await executeExecutiveCycle('run1',setup(repo,now,generate))).status,'awaiting-decision')
 const run=await repo.get('run1');assert.deepEqual(run.stages.map(s=>s.identity),['executive:cfo','executive:reviewer','executive:coo','executive:bruce'])
 assert.equal(run.decision,null);assert.equal(inputs[0].input.context.ledger.rows,undefined)
 assert.equal(JSON.stringify(inputs[2].input.context).includes('privateFinance'),false)
 assert.equal(JSON.stringify(inputs[3].input.context).includes('privateFinance'),false)
 assert.equal(inputs[1].input.priorResults[0].role,'cfo')
 assert.equal((await executeExecutiveCycle('run1',setup(repo,now))).duplicate,true)
 const decided=await repo.decide('run1',{version:run.version,choice:'accepted-for-planning',note:'Prepare a statement request draft'},'Larry')
 assert.match(decided.decision.notice,/No source changes/)
 await assert.rejects(repo.decide('run1',{version:run.version,choice:'rejected',note:'stale'},'Larry'),{status:409})
})
test('reviewer blocks unsafe progression and preserves earlier evidence',async()=>{
 const {repo,now}=fixture();await repo.create({id:'blocked',member:'Larry'})
 const roles=[];await executeExecutiveCycle('blocked',setup(repo,now,async({role})=>{roles.push(role);return {result:{...result,status:role==='reviewer'?'blocked':'ready'},model:'fixture'}}))
 assert.deepEqual(roles,['cfo','reviewer']);assert.equal((await repo.get('blocked')).status,'blocked')
})
test('configuration revocation during inference prevents committing the result',async()=>{
 const {repo,now}=fixture();await repo.create({id:'revoked',member:'Larry'})
 await assert.rejects(executeExecutiveCycle('revoked',setup(repo,now,async()=>{await repo.configure({enabled:false,version:0},'Larry');return {result,model:'fixture'}})))
 assert.equal((await repo.get('revoked')).stages.length,0);assert.equal((await repo.get('revoked')).status,'failed')
})
test('on-demand reviews exceed three completed runs while admission and leases prevent overlap',async()=>{
 const {repo,advance}=fixture();await repo.create({id:'one',member:'Larry'})
 assert.equal((await repo.create({id:'one',member:'Larry'})).replayed,true)
 await assert.rejects(repo.create({id:'one',goal:'different',member:'Larry'}),{status:409})
 await assert.rejects(repo.create({id:'two',member:'Larry'}),{status:409})
 const lease=await repo.claim('one');assert.equal(await repo.claim('one'),null)
 advance(15*60000);await assert.rejects(repo.append('one',lease,{role:'cfo',result}),{status:409})
 await repo.cancel('one','Larry')
 for(const id of ['two','three','four','five']){await repo.create({id,member:'Larry'});const next=await repo.claim(id);await repo.finish(id,next,'awaiting-decision','Ready');await repo.release(next)}
 assert.equal((await repo.list()).usage.manualRuns,5)
 await repo.configure({enabled:true,version:0,manualDailyLimit:4},'Larry')
 await assert.rejects(repo.create({id:'six',member:'Larry'}),{status:429})
 await repo.create({id:'daily-2026-11-19',member:'Larry',scheduled:true})
})
test('simultaneous create requests admit only one and optional allowance excludes failed runs',async()=>{
 const {repo}=fixture();await repo.configure({enabled:false,version:0,manualDailyLimit:1},'Larry')
 const results=await Promise.allSettled(['a','b'].map(id=>repo.create({id,member:'Larry'})))
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
 const id=results.find(r=>r.status==='fulfilled').value.run.id,lease=await repo.claim(id)
 await repo.finish(id,lease,'failed','No result');await repo.release(lease)
 await repo.create({id:'replacement',member:'Larry'})
 assert.equal((await repo.list()).usage.failedRuns,1)
})
test('cancellation during inference cannot be overwritten by a late result',async()=>{
 const {repo,now}=fixture();await repo.create({id:'cancel',member:'Larry'})
 await assert.rejects(executeExecutiveCycle('cancel',setup(repo,now,async()=>{await repo.cancel('cancel','Larry');return {result,model:'fixture'}})))
 const run=await repo.get('cancel');assert.equal(run.status,'cancelled');assert.equal(run.stages.length,0)
})
test('scheduled cycle runs only once per Eastern day and never in previews',async()=>{
 const {repo}=fixture();await repo.configure({enabled:true,version:0},'Larry');let dispatched=0
 const args={repository:repo,isPreview:false,ready:true,dispatch:async id=>{dispatched++;const lease=await repo.claim(id);await repo.finish(id,lease,'blocked','Fixture');await repo.release(lease)}}
 assert.deepEqual(await runScheduledExecutiveCycle({...args,now:new Date('2026-11-19T07:15:00Z')}),{skipped:true})
 await runScheduledExecutiveCycle({...args,now:new Date('2026-11-19T08:15:00Z')})
 await runScheduledExecutiveCycle({...args,now:new Date('2026-11-19T08:15:00Z')})
 assert.equal(dispatched,1)
 assert.deepEqual(await runScheduledExecutiveCycle({...args,isPreview:true,now:new Date('2026-11-19T08:15:00Z')}),{skipped:true})
})
test('cycle API enforces administrator, member, custom header and readiness',async()=>{
 const {repo}=fixture();let dispatches=0
 const base={repository:()=>repo,readiness:()=>({ready:true}),dispatch:async()=>{dispatches++;return {accepted:true}}}
 for(const session of [null,{member:'Nyla',role:'member'}])assert.equal((await createExecutiveCyclesHandler({...base,authenticate:async()=>session})({httpMethod:'GET'})).statusCode,session?403:401)
 const handler=createExecutiveCyclesHandler({...base,authenticate:async()=>({member:'Larry',role:'admin'})})
 const event={httpMethod:'POST',headers:{'content-type':'application/json','x-brevity-executive':'1'},body:JSON.stringify({action:'start',id:'api',member:'Larry',goal:'Prepare options'})}
 assert.equal((await handler({...event,headers:{}})).statusCode,403)
 assert.equal((await handler({...event,body:JSON.stringify({action:'start',id:'api',member:'Nyla'})})).statusCode,409)
 assert.equal((await handler(event)).statusCode,202);assert.equal(dispatches,1)
 assert.equal((await handler({httpMethod:'GET'})).statusCode,200)
 assert.throws(()=>validateExecutiveResult({...result,summary:''}))
})

test('production context applies existing admin finance authority and rejects a removed administrator',async()=>{
 let reads=0
 const load=async()=>{reads++;return {householdDate:'2026-11-19',sources:[]}}
 const context=await loadExecutiveContext({member:'Larry'},{load,readPrincipal:async member=>({member,role:'admin'})})
 assert.equal(context.access.finance,true);assert.equal(context.access.vendorAdmin,false)
 assert.equal(context.signedInMember,'Larry')
 for(const principal of [null,{member:'Larry',role:'member'}])await assert.rejects(loadExecutiveContext({member:'Larry'},{load,readPrincipal:async()=>principal}),{status:403})
 assert.equal(reads,1)
})
test('large finance planning fields do not discard source freshness and smaller evidence',()=>{
 const sources=[{id:'shared-action-records',state:'available',asOf:'2026-11-19'}]
 const bounded=boundedExecutiveContext({role:'cfo',householdDate:'2026-11-19',sources,data:{finance:{rows:Array.from({length:100},()=>({description:'saved record '.repeat(100)}))},dailyFinance:{notice:'Current plan'},versions:{budget:4}}})
 assert.deepEqual(bounded.sources,sources);assert.equal(bounded.data.finance.omitted,true)
 assert.deepEqual(bounded.data.versions,{budget:4});assert.equal(bounded.data.dailyFinance.notice,'Current plan')
 assert.ok(JSON.stringify(bounded).length<50000)
})

test('record-level evidence is retained immutably and read through the administrator API',async()=>{
 const {repo,now}=fixture();await repo.create({id:'evidence',member:'Larry'})
 const saved={capturedAt:now().toISOString(),unmapped:{state:'available',count:1,rows:[{id:'u1',ownership:'unknown'}]},ledger:{},accounts:{},planning:{},savedScenarios:{}}
 await executeExecutiveCycle('evidence',{...setup(repo,now),financeReader:null,loadEvidence:async()=>saved})
 assert.deepEqual(await repo.evidence('evidence'),saved)
 assert.equal((await repo.get('evidence')).evidenceSummary.unmappedCount,1)
 const base={repository:()=>repo,readiness:()=>({ready:true})}
 const event={httpMethod:'GET',queryStringParameters:{evidence:'evidence'}}
 assert.equal((await createExecutiveCyclesHandler({...base,authenticate:async()=>null})(event)).statusCode,401)
 const response=await createExecutiveCyclesHandler({...base,authenticate:async()=>({role:'admin',member:'Larry'})})(event)
 assert.deepEqual(JSON.parse(response.body),saved)
 await repo.create({id:'legacy',member:'Larry'});assert.equal((await repo.evidence('legacy')).state,'unavailable')
})

test('provider diagnostics distinguish billing limits from transient rate limits without leaking upstream details',async()=>{
 const {generateExecutiveStage,safeExecutiveFailure,executiveProviderFailure}=await import('../../netlify/lib/executive-runs.mjs')
 const original=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only-key'
 try{
  for(const code of ['credit_balance_exhausted','organization_usage_limit_exceeded','organization_spend_limit_exceeded','project_spend_limit_exceeded','rate_limit_exceeded','slow_down']){
   await assert.rejects(generateExecutiveStage({role:'cfo',input:{},fetcher:async()=>new Response(JSON.stringify({error:{code,type:'insufficient_quota',message:'private account details'}}),{status:429})}),error=>{
    assert.equal(safeExecutiveFailure(error),`Model provider HTTP 429 (${code})`);return true
   })
  }
  assert.equal(executiveProviderFailure(429,{error:{code:null,type:'insufficient_quota'}}),'Model provider HTTP 429 (insufficient_quota)')
  assert.equal(executiveProviderFailure(429,{error:{code:'unrecognized private text',type:'rate_limit_error'}}),'Model provider HTTP 429 (rate_limit_exceeded)')
  assert.equal(executiveProviderFailure(429,{error:{code:'unrecognized private text',message:'private account details'}}),'Model provider HTTP 429 (provider_error)')
  await assert.rejects(generateExecutiveStage({role:'cfo',input:{},fetcher:async()=>new Response('non-JSON private response',{status:429})}),error=>{
   assert.equal(safeExecutiveFailure(error),'Model provider HTTP 429 (provider_error)');return true
  })
 }finally{if(original===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=original}
})
test('failure diagnostics expose only safe provider categories, never raw error contents',async()=>{
 const {safeExecutiveFailure}=await import('../../netlify/lib/executive-runs.mjs')
 assert.equal(safeExecutiveFailure({executiveFailure:'Model provider HTTP 429 (insufficient_quota)'}),'Model provider HTTP 429 (insufficient_quota)')
 assert.equal(safeExecutiveFailure({message:'secret-bearing upstream response',executiveFailure:'secret-bearing upstream response'}),'Runtime or source error; review saved receipts and access settings')
 assert.equal(safeExecutiveFailure({message:'Invalid stage response.'}),'Generated output did not satisfy the briefing contract')
})
