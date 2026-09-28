import test from 'node:test'
import assert from 'node:assert/strict'
import { agentTools, runAgentTool } from '../../netlify/lib/brevity-agent-tools.mjs'

const canonical={householdDate:'2026-09-28',sources:[{id:'rolling-meals',state:'available'}],rollingMealPlan:{days:[{date:'2026-09-28',meals:{breakfast:{name:'Eggs'}}}]},actionRecords:{finance:{recurringRecords:[{id:'rent'}]}}}

test('the agent reads pillar records without treating planned meals as consumption',async()=>{
  assert.equal(agentTools.length,2)
  const result=await runAgentTool({name:'get_pillar_records',arguments:'{"pillar":"health"}'},{canonical,browser:{}})
  assert.equal(result.plannedMeals.days[0].meals.breakfast.name,'Eggs')
  assert.equal(result.consumedMeals,undefined)
  const finance=await runAgentTool({name:'get_pillar_records',arguments:'{"pillar":"finance"}'},{canonical,browser:{finance:{transactionSummary:{count:3}}}})
  assert.equal(finance.finance.recurringRecords[0].id,'rent')
  assert.equal(finance.browserFinance.transactionSummary.count,3)
})

test('meal estimate tool returns calculation with an explicit unlogged state',async()=>{
  const calls=[]
  const result=await runAgentTool({name:'estimate_meal_nutrition',arguments:'{"ingredients":["3 eggs","1 apple"]}'},{canonical,browser:{},calculate:async input=>{calls.push(input);return {perServingMacros:{proteinGrams:18}}}})
  assert.deepEqual(calls[0],{ingredients:['3 eggs','1 apple'],yieldQuantity:1,yieldUnit:'meal'})
  assert.equal(result.logged,false)
  assert.equal(result.estimate.perServingMacros.proteinGrams,18)
  assert.match(result.notice,/not recorded/)
})
