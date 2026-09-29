import test from 'node:test'
import assert from 'node:assert/strict'
import {createUsageRepository,pruneUsageStore} from '../../netlify/lib/usage-metrics.mjs'
import {createUsageHandler} from '../../netlify/functions/brevity-usage.mjs'
import {normalizeActionProposal,permissionForOperation} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation,resourceForOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {configuredPillars} from '../modules/configuration.js'
import {scalePackagedPortion} from '../../netlify/lib/meal-nutrition.mjs'
import {weeklyHouseholdBriefing} from '../../netlify/lib/weekly-household-briefing.mjs'
import scoped from '../../netlify/lib/scoped-store.cjs'
function fixture(){const values=new Map();let sequence=0;return {values,store:{async getWithMetadata(key){return structuredClone(values.get(key)||null)},async setJSON(key,data,options={}){const old=values.get(key);if(options.onlyIfNew&&old||options.onlyIfMatch&&old?.etag!==options.onlyIfMatch)return{modified:false};values.set(key,{data:structuredClone(data),etag:String(++sequence)});return{modified:true}},async delete(key){values.delete(key)},async *list(){yield{blobs:[...values.keys()].map(key=>({key}))}}}}}
test('usage records scrub private fields, deduplicate events, isolate households and expire',async()=>{
 const f=fixture(),now=()=>new Date('2026-09-29T12:00Z'),repo=createUsageRepository({store:f.store,now})
 const event={id:'one',kind:'assistant',outcome:'answered',durationMs:90,content:'private text',food:'private food',bankBalance:123}
 await repo.record('Larry',event);await repo.record('Larry',event)
 assert.doesNotMatch(JSON.stringify([...f.values]),/private text|private food|bankBalance/)
 assert.equal((await repo.summary(['Larry'])).members[0].requests,1)
 assert.equal((await repo.summary(['Lorenzo'])).members[0].requests,0)
 assert.equal((await createUsageRepository({store:f.store,householdId:'other',now}).summary(['Larry'])).members[0].requests,0)
 await pruneUsageStore(f.store,new Date('2027-01-01T12:00Z'));assert.equal(f.values.size,0)
})
test('feedback and measurements bind to authenticated member, not client member',async()=>{
 const seen=[];const handler=createUsageHandler({readSession:async()=>({member:'Isaiah',role:'member'}),repository:()=>({record:async(...args)=>seen.push(args),summary:async members=>({members})})})
 const response=await handler({httpMethod:'GET'});assert.deepEqual(JSON.parse(response.body).members,['Isaiah'])
 await handler({httpMethod:'POST',body:JSON.stringify({id:'feedback-11111111-1111-4111-8111-111111111111',outcome:'friction',member:'Larry',text:'discard'})})
 assert.equal(seen[0][0],'Isaiah');assert.equal(seen[0][1].text,undefined)
})
test('usage coverage separates recorded days, absent history and failed reads',async()=>{
 const f=fixture(),now=()=>new Date('2026-09-29T12:00Z'),repo=createUsageRepository({store:f.store,now})
 await repo.record('Larry',{id:'request',kind:'assistant',outcome:'answered',durationMs:10})
 const original=f.store.getWithMetadata
 f.store.getWithMetadata=async key=>{if(key.includes('/2026-09-27/'))throw Error('Unavailable');return original(key)}
 const summary=await repo.summary(['Larry'],{days:3}),member=summary.members[0]
 assert.deepEqual(member.recordedDays,['2026-09-29'])
 assert.deepEqual(member.missingDays,['2026-09-28'])
 assert.deepEqual(member.unavailableDays,['2026-09-27'])
 assert.equal(member.requests,1)
 assert.match(summary.notice,/No failed reads does not prove full coverage/)
})
test('module customization requires administrator and preserves underlying records when hidden',()=>{
 const op=normalizeActionProposal({summary:'Customize modules',operations:[{type:'module.configuration.update',targetId:'household-modules',payload:{modules:[{id:'custom-care',label:'Caregiving',pillarId:'household'},{id:'meal-plan',enabled:false}]}}]},{member:'Larry',role:'admin'}).operations[0]
 assert.equal(resourceForOperation(op),'shared:brevity_modules_v1')
 assert.equal(permissionForOperation({operation:op,member:'Terica',role:'member',permissions:{planning:true}}).allowed,false)
 const value=applyRecordOperation(null,op).after,pillars=configuredPillars(value)
 assert.ok(pillars.some(p=>p.items.some(i=>i.id==='custom-care')));assert.ok(!pillars.some(p=>p.items.some(i=>i.id==='meal-plan')))
 assert.equal(value.length,2)
})
test('packaged mineral amounts are scaled from the label; unknown remains unknown',()=>{
 const value=scalePackagedPortion({consumedAmount:6,consumedUnit:'oz',labelServingAmount:2,labelServingUnit:'oz',labelMacros:{calories:190,proteinGrams:6,carbohydrateGrams:2,fatGrams:16},labelNutrients:{potassiumMilligrams:100,calciumMilligrams:null,ironMilligrams:0.5}})
 assert.equal(value.potassiumMilligrams,300);assert.equal(value.ironMilligrams,1.5);assert.equal(value.calciumMilligrams,null)
})
test('unavailable weekly sources do not crash or turn into verified zero activity',()=>{
 const value=weeklyHouseholdBriefing({recentActivities:[null],recentNutrition:[null],recentDailyPlans:[null],supplementalSources:{'activity:2026-09-29':'unavailable'}})
 assert.equal(value.fitness.reportedWorkouts,null);assert.equal(value.fitness.reportedMinutes,null);assert.deepEqual(value.unavailableSources,['activity:2026-09-29']);assert.match(value.scope,/Missing records/)
})
test('trusted preview build scope cannot address production stores',()=>{
 assert.equal(scoped.scopedName('brevity-meals',{preview:false}),'brevity-meals')
 assert.equal(scoped.scopedName('brevity-meals',{preview:true,reviewId:'234'}),'preview-234-brevity-meals')
 assert.notEqual(scoped.scopedName('brevity-meals',{preview:true,reviewId:'235'}),scoped.scopedName('brevity-meals',{preview:true,reviewId:'234'}))
})

test("unavailable nutrition never becomes a zero-meal briefing",()=>{
 const value=weeklyHouseholdBriefing({nutritionUnavailable:true,recentNutrition:[],supplementalSources:{"nutrition:2026-09-29":"unavailable"}})
 assert.equal(value.nutrition.meals,null);assert.equal(value.nutrition.daysLogged,null);assert.equal(value.nutrition.coverage,"incomplete");assert.deepEqual(value.nutrition.unavailableDates,["2026-09-29"])
})
