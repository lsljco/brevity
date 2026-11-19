import test from 'node:test'
import assert from 'node:assert/strict'
import {createExecutiveRepository,executiveContext} from '../../netlify/lib/executive-workspace.mjs'
import {createExecutiveHandler} from '../../netlify/functions/executive-workspace.mjs'
import {createBrevitySdkAgent} from '../../netlify/lib/brevity-sdk-agent.mjs'
const admin={member:'Larry',role:'admin'}
const input={id:'test-1',role:'bruce',to:'coo',title:'Prepare next day',sourceRef:'plan:2026-11-19',sourceAsOf:'unknown',note:'Check capacity',due:'2026-11-20'}
function fixture(){
 const entries=new Map();let n=0,conflict=false
 const store={async get(key){return structuredClone(entries.get(key)?.data||null)},async getWithMetadata(key){return structuredClone(entries.get(key)||null)},async list({prefix}){return {blobs:[...entries.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))}},async setJSON(key,data,options){const prior=entries.get(key);if(conflict||options.onlyIfNew&&prior||options.onlyIfMatch&&options.onlyIfMatch!==prior?.etag)return {modified:false};const etag=String(++n);entries.set(key,{data:structuredClone(data),etag});return {modified:true,etag}}}
 return {repo:createExecutiveRepository({store}),entries,setConflict:()=>{conflict=true}}
}
test('role snapshots exclude unrelated source content and secrets',()=>{
 const canonical={sources:[],dailyPlan:{finance:{private:'money'},education:{private:'school'},household:{priorities:['Work']}},actionRecords:{finance:{budgets:{total:100},access_token:'secret'},projects:[{id:'p'}]},recentNutrition:[{private:'health'}]}
 assert.equal(executiveContext('coo',canonical).data.finance,undefined)
 assert.equal(JSON.stringify(executiveContext('coo',canonical)).includes('money'),false)
 assert.equal(JSON.stringify(executiveContext('cfo',canonical)).includes('secret'),false)
 assert.equal(executiveContext('cfo',canonical).data.finance.budgets.total,100)
 assert.equal(JSON.stringify(executiveContext('cto',canonical)).includes('money'),false)
 assert.throws(()=>executiveContext('career',canonical))
})
test('handoff creation is idempotent but refuses reuse for different work',async()=>{
 const {repo}=fixture();const first=await repo.create(input,admin)
 assert.equal(first.row.status,'queued');assert.equal((await repo.create(input,admin)).replayed,true)
 await assert.rejects(repo.create({...input,note:'different'},admin),{status:409})
 await assert.rejects(repo.create({...input,id:'other'}, {member:'Nyla',role:'member'}),{status:403})
 assert.equal((await repo.list('cto')).rows.length,0)
 await assert.rejects(repo.get(input.id,'cto'),{status:403})
})
test('ownership, stale versions and atomic conflicts prevent overwrites',async()=>{
 const {repo,setConflict}=fixture();await repo.create(input,admin)
 await assert.rejects(repo.change({id:input.id,role:'cfo',status:'in-progress',version:1,note:'Started'},admin),{status:403})
 const changed=await repo.change({id:input.id,role:'coo',status:'in-progress',version:1,note:'Started'},admin)
 assert.equal(changed.row.history.length,2)
 await assert.rejects(repo.change({id:input.id,role:'coo',status:'blocked',version:1,note:'Stale'},admin),{status:409})
 setConflict()
 await assert.rejects(repo.change({id:input.id,role:'coo',status:'blocked',version:2,note:'Conflict'},admin),{status:409})
 assert.equal((await repo.get(input.id,'bruce')).version,2)
})
test('completion requires evidence, cannot be called verified, and history remains intact',async()=>{
 const {repo}=fixture();await repo.create(input,admin)
 await assert.rejects(repo.change({id:input.id,role:'coo',status:'reported-complete',version:1,note:''},admin))
 await assert.rejects(repo.change({id:input.id,role:'coo',status:'verified',version:1,note:'Done'},admin))
 const {row}=await repo.change({id:input.id,role:'coo',status:'reported-complete',version:1,note:'Prepared plan reference 123'},admin)
 assert.equal(row.history[1].actor,'Larry');assert.equal(row.history[1].role,'coo')
 await assert.rejects(repo.change({id:input.id,role:'coo',status:'in-progress',version:2,note:'Reopen'},admin),{status:409})
})
test('API refuses anonymous, non-admin and cross-site style mutations',async()=>{
 for(const session of [null,{member:'Nyla',role:'member'}]){
  let loaded=false;const handler=createExecutiveHandler({authenticate:async()=>session,loadContext:async()=>{loaded=true}})
  assert.equal((await handler({httpMethod:'GET',queryStringParameters:{view:'context'}})).statusCode,session?403:401);assert.equal(loaded,false)
 }
 const handler=createExecutiveHandler({authenticate:async()=>admin,repository:()=>fixture().repo})
 assert.equal((await handler({httpMethod:'POST',body:'{}'})).statusCode,403)
 assert.equal((await handler({httpMethod:'POST',headers:{'content-type':'application/json','x-brevity-executive':'1'},body:JSON.stringify({...input,action:'create',member:'Nyla'})})).statusCode,409)
})
test('API creates and reads shared work but never starts a worker',async()=>{
 const {repo}=fixture();const handler=createExecutiveHandler({authenticate:async()=>admin,repository:()=>repo})
 const result=await handler({httpMethod:'POST',headers:{'content-type':'application/json','x-brevity-executive':'1'},body:JSON.stringify({...input,action:'create',member:'Larry'})})
 assert.equal(result.statusCode,200)
 const queue=JSON.parse((await handler({httpMethod:'GET',queryStringParameters:{role:'coo'}})).body)
 assert.equal(queue.rows.length,1);assert.equal(queue.workerEnabled,false)
})
test('assistant executive tool is only exposed to server-authorized admins',()=>{
 const make=access=>createBrevitySdkAgent({model:'test',schema:{type:'object',properties:{}},canonical:{access},browser:{}})
 assert.equal(make({vendorAdmin:false}).tools.some(tool=>tool.name==='read_executive_workspace'),false)
 assert.equal(make({vendorAdmin:true}).tools.some(tool=>tool.name==='read_executive_workspace'),true)
})
