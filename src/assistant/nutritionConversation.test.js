import test from 'node:test'
import assert from 'node:assert/strict'
import {bindNutritionOperation} from '../../netlify/lib/nutrition-conversation.mjs'
const estimate={ingredients:[{input:'6 oz sausage'}],perServingMacros:{calories:570,proteinGrams:18,carbohydrateGrams:6,fatGrams:51}}
const context={member:'Larry',date:'2026-09-28',recentNutrition:[{date:'2026-09-27',entries:[{id:'breakfast',member:'Larry'}]}],estimates:new Map([['fresh',estimate]])}
const operation={type:'nutrition.meal.update',targetId:'Larry',targetDate:'2026-09-27',payloadJson:JSON.stringify({entryId:'breakfast',reason:'Corrected portion',name:'Breakfast',estimateId:'fresh'})}
test('spoken correction binds the server estimate to the exact saved meal without creating a new log',()=>{
 const result=bindNutritionOperation(operation,context),data=JSON.parse(result.payloadJson)
 assert.equal(result.type,'nutrition.meal.update');assert.equal(data.proteinGrams,18);assert.equal(data.entryId,'breakfast')
 assert.deepEqual(JSON.parse(data.estimateJson),estimate)
})
test('spoken corrections reject another member, wrong date, unknown entry or forged macros',()=>{
 for(const patch of [{targetId:'Lorenzo'},{targetDate:'2026-09-26'},{payloadJson:JSON.stringify({entryId:'other',name:'Breakfast',reason:'Portion',estimateId:'fresh'})},{payloadJson:JSON.stringify({entryId:'breakfast',name:'Breakfast',reason:'Portion',estimateId:'stale'})},{payloadJson:JSON.stringify({...JSON.parse(operation.payloadJson),proteinGrams:99})}])assert.throws(()=>bindNutritionOperation({...operation,...patch},context),/could not be verified/)
})
test('removal stays bound to the owned entry and requires a reason',()=>{
 const removal={...operation,type:'nutrition.meal.remove',payloadJson:JSON.stringify({entryId:'breakfast',reason:'Logged twice'})}
 assert.deepEqual(JSON.parse(bindNutritionOperation(removal,context).payloadJson),{entryId:'breakfast',reason:'Logged twice'})
 assert.throws(()=>bindNutritionOperation({...removal,payloadJson:'{"entryId":"breakfast"}'},context))
})
