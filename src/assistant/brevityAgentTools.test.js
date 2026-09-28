import test from 'node:test'
import assert from 'node:assert/strict'
import { createBrevitySdkAgent, runBrevitySdkAgent } from '../../netlify/lib/brevity-sdk-agent.mjs'

const canonical={householdDate:'2026-09-28',sources:[{id:'rolling-meals',state:'available'}],rollingMealPlan:{days:[{date:'2026-09-28',meals:{breakfast:{name:'Eggs'}}}]},actionRecords:{finance:{recurringRecords:[{id:'rent'}]}}}
const schema={type:'object',additionalProperties:false,required:['message','proposal'],properties:{message:{type:'string'},proposal:{type:'null'}}}

test('SDK agent reads pillar records without claiming planned meals were consumed',async()=>{
  const agent=createBrevitySdkAgent({model:'test',schema,canonical,browser:{finance:{transactionSummary:{count:3}}}})
  assert.deepEqual(agent.tools.map(item=>item.name),['get_pillar_records','estimate_meal_nutrition','web_search'])
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
  const result=JSON.parse(await agent.tools[1].invoke({},'{"ingredients":["3 eggs","1 apple"],"allowGenericEstimate":false,"productReferences":[]}'))
  assert.deepEqual(calls[0],{ingredients:['3 eggs','1 apple'],yieldQuantity:1,yieldUnit:'meal',conversational:true,allowGenericEstimate:false,productReferences:[]})
  assert.equal(result.logged,false)
  assert.match(result.estimateId,/^[a-f0-9-]{36}$/)
  assert.equal(result.estimate.perServingMacros.proteinGrams,18)
  assert.match(result.notice,/not recorded/)
})

test('SDK runner is bounded and returns structured output to Action Mode',async()=>{
  const runner={run:async(agent,prompt,options)=>{
    assert.equal(agent.name,'Brevity')
    assert.equal(prompt,'Read Finance')
    assert.equal(options.maxTurns,8)
    return {finalOutput:{message:'Read Finance',proposal:null},interruptions:[]}
  }}
  const result=await runBrevitySdkAgent({prompt:'Read Finance',model:'test',schema,canonical,browser:{},runner})
  assert.deepEqual(result.output,{message:'Read Finance',proposal:null})
  assert.equal(result.estimates.size,0)
})


test('clarification blocks estimates and proposals until a new conversational turn',async()=>{
  let calls=0
  const calculate=async()=>{calls++;throw Object.assign(new Error('Which sausage brand did you have?'),{code:'NUTRITION_CLARIFICATION_REQUIRED',questions:['Which sausage brand did you have?']})}
  const input=JSON.stringify({ingredients:['a smoked sausage','two pieces of toast'],allowGenericEstimate:false,productReferences:[]})
  const runner={run:async agent=>{
    const first=JSON.parse(await agent.tools[1].invoke({},input))
    assert.equal(first.estimateId,null)
    assert.equal(first.logged,false)
    await agent.tools[1].invoke({},input)
    return {finalOutput:{message:'Guessed meal',proposal:{summary:'Unsafe guess'}},interruptions:[]}
  }}
  const result=await runBrevitySdkAgent({prompt:'I ate a sausage and toast',model:'test',schema,canonical,browser:{},calculate,runner})
  assert.equal(calls,1)
  assert.deepEqual(result.output,{message:'Which sausage brand did you have?',proposal:null})
  assert.equal(result.estimates.size,0)
})

test('clarified foods and retrieved product references reach the calculator together',async()=>{
  const reference={url:'https://example.com/product',details:'Example test product: 2 oz serving, 190 calories, 6 g protein.'}
  const agent=createBrevitySdkAgent({model:'test',schema,canonical,browser:{},calculate:async input=>{
    assert.deepEqual(input.productReferences,[reference])
    assert.equal(input.ingredients[0],'6 oz Example Original smoked sausage')
    assert.equal(input.allowGenericEstimate,false)
    return {perServingMacros:{calories:570,proteinGrams:18,carbohydrateGrams:6,fatGrams:51}}
  }})
  const result=JSON.parse(await agent.tools[1].invoke({},JSON.stringify({ingredients:['6 oz Example Original smoked sausage'],allowGenericEstimate:false,productReferences:[reference]})))
  assert.ok(result.estimateId)
  assert.equal(result.logged,false)
})
