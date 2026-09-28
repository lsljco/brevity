import test from 'node:test'
import assert from 'node:assert/strict'
import { createBrevitySdkAgent, runBrevitySdkAgent } from '../../netlify/lib/brevity-sdk-agent.mjs'

const canonical={householdDate:'2026-09-28',sources:[{id:'rolling-meals',state:'available'}],rollingMealPlan:{days:[{date:'2026-09-28',meals:{breakfast:{name:'Eggs'}}}]},actionRecords:{finance:{recurringRecords:[{id:'rent'}]}}}
const schema={type:'object',additionalProperties:false,required:['message','proposal'],properties:{message:{type:'string'},proposal:{type:'null'}}}

test('SDK agent reads pillar records without claiming planned meals were consumed',async()=>{
  const agent=createBrevitySdkAgent({model:'test',schema,canonical,browser:{finance:{transactionSummary:{count:3}}}})
  assert.deepEqual(agent.tools.map(item=>item.name),['get_pillar_records','estimate_meal_nutrition'])
  assert.equal(agent.modelSettings.store,false)
  const health=JSON.parse(await agent.tools[0].invoke({},'{"pillar":"health"}'))
  assert.equal(health.plannedMeals.days[0].meals.breakfast.name,'Eggs')
  assert.equal(health.consumedMeals,undefined)
  const finance=JSON.parse(await agent.tools[0].invoke({},'{"pillar":"finance"}'))
  assert.equal(finance.finance.recurringRecords[0].id,'rent')
  assert.equal(finance.browserFinance.transactionSummary.count,3)
})

test('SDK nutrition tool estimates but does not save consumption',async()=>{
  const calls=[]
  const agent=createBrevitySdkAgent({model:'test',schema,canonical,browser:{},calculate:async input=>{calls.push(input);return {perServingMacros:{proteinGrams:18}}}})
  const result=JSON.parse(await agent.tools[1].invoke({},'{"ingredients":["3 eggs","1 apple"]}'))
  assert.deepEqual(calls[0],{ingredients:['3 eggs','1 apple'],yieldQuantity:1,yieldUnit:'meal'})
  assert.equal(result.logged,false)
  assert.equal(result.estimate.perServingMacros.proteinGrams,18)
  assert.match(result.notice,/not recorded/)
})

test('SDK runner is bounded and returns structured output to Action Mode',async()=>{
  const runner={run:async(agent,prompt,options)=>{
    assert.equal(agent.name,'Brevity')
    assert.equal(prompt,'Read Finance')
    assert.equal(options.maxTurns,5)
    return {finalOutput:{message:'Read Finance',proposal:null},interruptions:[]}
  }}
  assert.deepEqual(await runBrevitySdkAgent({prompt:'Read Finance',model:'test',schema,canonical,browser:{},runner}),{message:'Read Finance',proposal:null})
})
