import test from 'node:test'
import assert from 'node:assert/strict'
import {loadAssistantSupplementalContext,assertActionSourcesAvailable} from '../../netlify/lib/assistant-supplemental-context.mjs'
import {pillarRecords} from '../../netlify/lib/brevity-agent-tools.mjs'
const base={canonical:{householdDate:'2026-09-28'},member:'Larry',resources:{read:async()=>({value:null,version:0})},loadLibrary:async()=>({entry:{data:null},library:[]}),loadCalendar:async()=>({events:[]})}
test('unavailable nutrition never becomes zero consumption and does not discard available recipes',async()=>{
 const result=await loadAssistantSupplementalContext({...base,resources:{read:async key=>{if(key==='nutrition:Larry:2026-09-28')throw new Error('private provider detail');return {value:null,version:0}}}})
 assert.equal(result.dailyNutrition,null);assert.equal(result.nutritionProgress,null)
 assert.equal(result.mealLibraryUnavailable,false);assert.equal(result.recentNutrition.length,6)
 assert.deepEqual(result.unavailableNutritionDates,['2026-09-28'])
 assert.equal(pillarRecords('health',{...base.canonical,...result},{}).nutritionProgress,null)
 assert.throws(()=>assertActionSourcesAvailable({type:'nutrition.meal.log',targetDate:'2026-09-28'},result),/temporarily unavailable/)
 assert.doesNotThrow(()=>assertActionSourcesAvailable({type:'meal.recipe.update'},result))
})
test('calendar, recipes and targets fail independently without blocking unrelated answers',async()=>{
 const result=await loadAssistantSupplementalContext({...base,loadLibrary:async()=>{throw Error('down')},loadCalendar:async()=>null,resources:{read:async key=>{if(key.startsWith('nutrition-targets:'))throw Error('down');return {value:null}}}})
 assert.equal(result.dailyNutrition.totals.calories,0);assert.equal(result.nutritionTargets,null);assert.equal(result.nutritionProgress,null)
 assert.equal(result.calendar,null);assert.equal(result.mealLibraryUnavailable,true)
 assert.throws(()=>assertActionSourcesAvailable({type:'calendar.create'},result),/temporarily unavailable/)
 assert.throws(()=>assertActionSourcesAvailable({type:'meal.recipe.update'},result),/temporarily unavailable/)
 assert.doesNotThrow(()=>assertActionSourcesAvailable({type:'assignment.create'},result))
})
test('a stalled optional source has a bounded read window',async()=>{
 const result=await loadAssistantSupplementalContext({...base,timeoutMs:10,loadCalendar:()=>new Promise(()=>{})})
 assert.equal(result.supplementalSources['apple-calendar'],'unavailable')
 assert.equal(result.supplementalSources['recipe-library'],'available')
})

test('unavailable canonical plan or shared records block dependent proposals, not unrelated advice',()=>{
 const context={sources:[{id:'daily-plan',state:'unavailable'},{id:'shared-action-records',state:'unavailable'}]}
 for(const type of ['plan.pillar.update','assignment.create','project.update','budget.update'])assert.throws(()=>assertActionSourcesAvailable({type},context),/temporarily unavailable/)
 assert.doesNotThrow(()=>assertActionSourcesAvailable({type:'meal.recipe.update'},context))
})
