import test from 'node:test'
import assert from 'node:assert/strict'
import { agentTools, runAgentTool } from '../../netlify/lib/brevity-agent-tools.mjs'
import { runBrevityAgent } from '../../netlify/lib/run-brevity-agent.mjs'

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

test('agent passes tool receipts back to the model and bounds repeated calls',async()=>{
  const requests=[]
  const fetcher=async(_url,options)=>{
    const request=JSON.parse(options.body);requests.push(request)
    return {ok:true,json:async()=>requests.length===1
      ?{output:[{type:'function_call',call_id:'call_1',name:'get_pillar_records',arguments:'{"pillar":"finance"}'}]}
      :{output:[{type:'message',content:[{type:'output_text',text:'{"message":"Read Finance","proposal":null}'}]}]}}
  }
  const result=await runBrevityAgent({prompt:'Finance',model:'test',apiKey:'test',schema:{},fetcher,executeTool:()=>({balance:42})})
  assert.equal(requests.length,2)
  assert.equal(requests[0].store,false)
  assert.equal(requests[1].input.at(-1).call_id,'call_1')
  assert.deepEqual(JSON.parse(requests[1].input.at(-1).output),{balance:42})
  assert.equal(result.payload.output[0].type,'message')

  const repeated=await runBrevityAgent({prompt:'Loop',model:'test',apiKey:'test',schema:{},maxSteps:2,fetcher:async()=>({ok:true,json:async()=>({output:[{type:'function_call',call_id:'same',name:'get_pillar_records',arguments:'{}'}]})}),executeTool:()=>({})})
  assert.equal(repeated.limitReached,true)
})
