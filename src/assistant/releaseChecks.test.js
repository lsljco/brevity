import {dailyHouseholdBriefing} from '../../netlify/lib/daily-household-briefing.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {releaseCheckAccess} from '../../netlify/lib/release-check-access.mjs'
import {evaluateHouseholdCase,evaluationCases,evaluationFixture} from '../../netlify/lib/household-agent-evaluation.mjs'
test('completed workout evaluation checks the requested record, not a redundant lookup',async()=>{
 const item=evaluationCases.find(item=>item.id==='actual-workout')
 const base={type:'activity.record',targetId:'Larry',targetDate:'2026-09-28',payload:{kind:'workout',title:'30-minute walk',durationMinutes:30,status:'complete'}}
 for(const [operation,expected] of [[base,true],[{...base,payload:{...base.payload,durationMinutes:20}},false],[{...base,payload:{...base.payload,calories:200}},false],[{...base,targetId:'Lorenzo'},false],[{...base,targetDate:'2026-09-29'},false]]){
  const result=await evaluateHouseholdCase(item,{run:async args=>{args.onTool('prepare_action_review');return {output:{message:'Review the completed walk.',proposal:{summary:'Completed walk',operations:[operation]}},estimates:new Map()}}})
  assert.equal(result.checks.requestedActivityMatches,expected)
  assert.equal(result.structuralPass,expected)
 }
})
test('release checks remain unavailable in production and require a preview administrator',()=>{
 assert.equal(releaseCheckAccess({role:'admin'},{preview:false}).status,404)
 assert.equal(releaseCheckAccess(null,{preview:true}).status,401)
 assert.equal(releaseCheckAccess({role:'member'},{preview:true}).status,403)
 assert.equal(releaseCheckAccess({role:'admin'},{preview:true}),null)
})
test('live evaluation uses production instructions and preserves conversation roles',async()=>{
 const item=evaluationCases.find(item=>item.id==='meal-followup')
 const result=await evaluateHouseholdCase(item,{run:async args=>{
  assert.deepEqual(args.prompt.slice(1),item.messages)
  assert.match(args.requestInstructions,/signed-in member: Larry/)
  assert.equal(args.canonical.dailyNutrition.entries[0].id,'breakfast')
  return {output:{message:'Which exact variant?',proposal:null},estimates:new Map()}
 }})
 assert.equal(result.structuralPass,true)
})
test('evaluation rejects structurally plausible actions that fail the real action contract',async()=>{
 const result=await evaluateHouseholdCase(evaluationCases.find(item=>item.id==='household-task'),{run:async()=>({output:{message:'Prepared',proposal:{summary:'Task',operations:[{type:'assignment.create',targetDate:'2026-09-28',payloadJson:'{"title":"Inspect garage","owner":"Unknown"}'}]}},estimates:new Map()})})
 assert.equal(result.checks.allowedActions,true)
 assert.equal(result.checks.contractValid,false)
 assert.equal(result.structuralPass,false)
})

test('target evaluation checks exact requested values and rejects extra changes without demanding an unnecessary read',async()=>{
 const item=evaluationCases.find(item=>item.id==='nutrition-target')
 for(const [payload,expected] of [[{proteinGrams:130},true],[{proteinGrams:120},false],[{proteinGrams:130,calories:2000},false]]){
  const result=await evaluateHouseholdCase(item,{run:async()=>({output:{message:'Review prepared',proposal:{summary:'Target',operations:[{type:'nutrition.targets.update',targetId:'Larry',targetDate:'2026-09-28',payload}]}},estimates:new Map()})})
  assert.equal(result.checks.requestedPayloadMatches,expected)
  assert.equal(result.structuralPass,expected)
 }
})

test('meal boundary evaluation rejects carrying breakfast foods into a separate lunch',async()=>{
 const item={...evaluationCases.find(item=>item.id==='meal-separate-occasions'),requiredTools:[],allowedProposalTypes:[]}
 for(const [ingredients,expected] of [[['6.7 oz cooked steak','300 g plain baked potato'],true],[['6.7 oz cooked steak','300 g plain baked potato','breakfast sausage and toast'],false]]){
  const result=await evaluateHouseholdCase(item,{run:async args=>{await args.calculate({ingredients,yieldQuantity:1,yieldUnit:'meal'});return {output:{message:'Fixture',proposal:null},estimates:new Map()}}})
  assert.equal(result.checks.mealBoundaryPreserved,expected)
 }
})

test('project lookup accepts the dedicated saved-record search as authoritative evidence',async()=>{
 const result=await evaluateHouseholdCase(evaluationCases.find(item=>item.id==='household-project'),{run:async args=>{args.onTool('search_household_records');return {output:{message:'Kitchen project status: In Progress.',proposal:null},estimates:new Map()}}})
 assert.equal(result.structuralPass,true)
})

test('complete isolated persistence harness remains executable with conditional storage',async()=>{
 const {verifyReleasePersistence}=await import('../../netlify/lib/release-persistence-checks.mjs')
 const values=new Map();let seq=0
 const store={async get(key){return structuredClone(values.get(key)?.data||null)},async getWithMetadata(key,options){const entry=structuredClone(values.get(key)||null);if(entry&&options?.type==='arrayBuffer')entry.data=Uint8Array.from(Buffer.from(JSON.stringify(entry.data))).buffer;return entry},async setJSON(key,data,options={}){const old=values.get(key);if(options.onlyIfNew&&old||options.onlyIfMatch&&old?.etag!==options.onlyIfMatch)return {modified:false};values.set(key,{data:structuredClone(data),etag:String(++seq)});return{modified:true}}}
 store.set=async(key,bytes,options)=>store.setJSON(key,JSON.parse(Buffer.from(bytes).toString()),options)
 const report=await verifyReleasePersistence({store,runId:'11111111-1111-4111-8111-111111111111'})
 assert.equal(report.passed,true);assert.equal(Object.keys(report.checks).length,21)
})


test('separate staging main builds receive preview isolation and release origin is build-bound',async()=>{
 const {releaseContext,allowedReleaseOrigin}=await import('../../netlify/lib/build-isolation.mjs')
 const staging=releaseContext({CONTEXT:'production',URL:'https://brevity-architect-staging.netlify.app',DEPLOY_PRIME_URL:'https://main--brevity-architect-staging.netlify.app',COMMIT_REF:'abc'})
 assert.equal(staging.preview,true);assert.equal(staging.reviewId,'staging')
 assert.equal(allowedReleaseOrigin('main--brevity-architect-staging.netlify.app','https://main--brevity-architect-staging.netlify.app',staging),true)
 for(const host of ['brevityoflife.netlify.app','evil.netlify.app','deploy-preview-241--brevity-architect-staging.netlify.app'])assert.equal(allowedReleaseOrigin(host,`https://${host}`,staging),false)
 assert.equal(allowedReleaseOrigin('main--brevity-architect-staging.netlify.app','https://evil.example',staging),false)
 const production=releaseContext({CONTEXT:'production',URL:'https://brevityoflife.netlify.app'})
 assert.equal(production.preview,false);assert.equal(allowedReleaseOrigin('brevityoflife.netlify.app',undefined,production),false)
 const preview=releaseContext({CONTEXT:'deploy-preview',REVIEW_ID:'241',URL:'https://brevity-architect-staging.netlify.app',DEPLOY_PRIME_URL:'https://deploy-preview-241--brevity-architect-staging.netlify.app'})
 assert.equal(preview.reviewId,'241');assert.equal(allowedReleaseOrigin('deploy-preview-241--brevity-architect-staging.netlify.app',undefined,preview),true)
 const oldPreview={preview:true,origin:'https://deploy-preview-233--brevityoflife.netlify.app'}
 assert.equal(allowedReleaseOrigin('deploy-preview-233--brevityoflife.netlify.app',undefined,oldPreview),true)
 assert.equal(releaseContext({URL:'https://brevity-architect-staging.netlify.app.evil.example'}).preview,false)
})

test('cross-pillar fixture exposes its dated saved plans through the daily briefing',async()=>{
 const item=evaluationCases.find(item=>item.id==='cross-pillar')
 const {canonical}=evaluationFixture(item),briefing=dailyHouseholdBriefing(canonical)
 assert.equal(briefing.sources.dailyPlan,'available')
 assert.equal(briefing.pillars.fitness.plan.focus,'Walk 30 minutes')
 assert.equal(briefing.pillars.education.plan.focus,'Read for 20 minutes')
 assert.equal(briefing.pillars.household.plan.focus,'Inspect garage')
 for(const [tool,expected] of [['get_daily_household_briefing',true],['get_pillar_records',true],[null,false]]){
  const result=await evaluateHouseholdCase(item,{run:async args=>{if(tool)args.onTool(tool);return {output:{message:'Balance the saved walk, reading and garage inspection.',proposal:null},estimates:new Map()}}})
  assert.equal(result.checks.requiredTools,expected)
 }
})
