import {assistantResponseSchema} from '../../netlify/lib/brevity-response-schema.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {getInputItems} from '../../node_modules/@openai/agents-openai/dist/openaiResponsesConverter.mjs'
import { createBrevitySdkAgent, runBrevitySdkAgent } from '../../netlify/lib/brevity-sdk-agent.mjs'

const canonical={householdDate:'2026-09-28',sources:[{id:'rolling-meals',state:'available'}],rollingMealPlan:{days:[{date:'2026-09-28',meals:{breakfast:{name:'Eggs'}}}]},actionRecords:{finance:{recurringRecords:[{id:'rent'}]}}}
const schema={type:'object',additionalProperties:false,required:['message','proposal'],properties:{message:{type:'string'},proposal:{type:'null'}}}

test('SDK agent reads pillar records without claiming planned meals were consumed',async()=>{
  const agent=createBrevitySdkAgent({model:'test',schema,canonical,browser:{finance:{transactionSummary:{count:3}}}})
  assert.deepEqual(agent.tools.map(item=>item.name),['get_module_configuration','get_weekly_household_briefing','get_pillar_records','estimate_meal_nutrition','search_meal_records','read_product_nutrition','find_product_nutrition','search_household_records','web_search'])
  assert.equal(agent.modelSettings.store,false)
  const health=JSON.parse(await agent.tools.find(t=>t.name==='get_pillar_records').invoke({},'{"pillar":"health"}'))
  assert.equal(health.plannedMeals.days[0].meals.breakfast.name,'Eggs')
  assert.equal(health.consumedMeals,undefined)
  const finance=JSON.parse(await agent.tools.find(t=>t.name==='get_pillar_records').invoke({},'{"pillar":"finance"}'))
  assert.equal(finance.finance.recurringRecords[0].id,'rent')
  assert.equal(finance.browserFinance.transactionSummary.count,3)
})

test('SDK nutrition tool estimates but does not save consumption',async()=>{
  const calls=[]
  const agent=createBrevitySdkAgent({model:'test',schema,canonical,browser:{},calculate:async input=>{calls.push(input);return {perServingMacros:{proteinGrams:18}}}})
  const result=JSON.parse(await agent.tools.find(t=>t.name==='estimate_meal_nutrition').invoke({},'{"ingredients":["3 eggs","1 apple"],"yieldQuantity":1,"yieldUnit":"meal","allowGenericEstimate":false,"productReferences":[]}'))
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
    assert.equal(options.maxTurns,12)
    return {finalOutput:{message:'Read Finance',proposal:null},interruptions:[]}
  }}
  const result=await runBrevitySdkAgent({prompt:'Read Finance',model:'test',schema,canonical,browser:{},runner})
  assert.deepEqual(result.output,{message:'Read Finance',proposal:null})
  assert.equal(result.estimates.size,0)
})


test('clarification blocks estimates and proposals until a new conversational turn',async()=>{
  let calls=0
  const calculate=async()=>{calls++;throw Object.assign(new Error('Which sausage brand did you have?'),{code:'NUTRITION_CLARIFICATION_REQUIRED',questions:['Which sausage brand did you have?']})}
  const input=JSON.stringify({ingredients:['a smoked sausage','two pieces of toast'],yieldQuantity:1,yieldUnit:'meal',allowGenericEstimate:false,productReferences:[]})
  const runner={run:async agent=>{
    const first=JSON.parse(await agent.tools.find(t=>t.name==='estimate_meal_nutrition').invoke({},input))
    assert.equal(first.estimateId,null)
    assert.equal(first.logged,false)
    await agent.tools.find(t=>t.name==='estimate_meal_nutrition').invoke({},input)
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
  const result=JSON.parse(await agent.tools.find(t=>t.name==='estimate_meal_nutrition').invoke({},JSON.stringify({ingredients:['6 oz Example Original smoked sausage'],yieldQuantity:1,yieldUnit:'meal',allowGenericEstimate:false,productReferences:[reference]})))
  assert.ok(result.estimateId)
  assert.equal(result.logged,false)
})


test('agent finds recipe records separately from consumption without asking for a record id',async()=>{
 const agent=createBrevitySdkAgent({model:'test',schema,browser:{},canonical:{...canonical,mealLibrary:[{id:'turkey',name:'Smoked Turkey Breast + Garlic Kale',ingredients:['turkey','kale']}],recentNutrition:[]}})
 const tool=agent.tools.find(item=>item.name==='search_meal_records')
 const result=JSON.parse(await tool.invoke({},JSON.stringify({query:'Smoked Turkey Breast + Garlic Kale'})))
 assert.equal(result.matches[0].id,'turkey');assert.equal(result.matches[0].kind,'recipe')
 assert.equal(result.recipeLibraryUnavailable,false)
 assert.match(agent.instructions,/action schema limits what you can change.*not what you can discuss/)
})

test('recipe calculations preserve batch yield through the agent tool',async()=>{
 const agent=createBrevitySdkAgent({model:'test',schema,canonical,browser:{},calculate:async request=>{
   assert.equal(request.yieldQuantity,6);assert.equal(request.yieldUnit,'servings')
   return {yieldQuantity:6,perServingMacros:{calories:200}}
 }})
 const output=JSON.parse(await agent.tools.find(t=>t.name==='estimate_meal_nutrition').invoke({},JSON.stringify({ingredients:['12 eggs'],yieldQuantity:6,yieldUnit:'servings',allowGenericEstimate:false,productReferences:[]})))
 assert.equal(output.estimate.yieldQuantity,6)
})


test('agent diagnostics log only run metadata, never conversation or provider error text',async()=>{
 const logs=[]
 const runner={run:async()=>{throw Object.assign(new Error('SECRET transcript and token'),{status:429})}}
 await assert.rejects(()=>runBrevitySdkAgent({prompt:'PRIVATE meal detail',model:'test',schema,canonical,browser:{},runner,providerRecovery:{sleep:async()=>{}},logger:(...parts)=>logs.push(parts)}))
 const serialized=JSON.stringify(logs)
 assert.doesNotMatch(serialized,/SECRET|PRIVATE|transcript|token/)
 const metadata=JSON.parse(logs[0][1])
 assert.equal(metadata.outcome,'failed');assert.equal(metadata.errorCategory,'rate_limit')
 assert.equal(typeof metadata.durationMs,'number')
})

test('request rules stay in agent instructions while conversation roles reach the runner intact',async()=>{
 const messages=[{role:'user',content:'Today I ate sausage.'},{role:'assistant',content:'Which brand?'},{role:'user',content:'Eckrich Original, four ounces.'}]
 const runner={run:async(agent,input)=>{
   assert.ok(agent.instructions.includes('Authenticated member: Larry.'))
   const converted=getInputItems(input)
   assert.deepEqual(converted.map(item=>({role:item.role,content:item.content[0].text})),messages)
   assert.equal(converted[1].content[0].type,'output_text')
   assert.ok(!agent.instructions.includes('Eckrich Original, four ounces.'))
   return {finalOutput:{message:'Was anything added?',proposal:null}}
 }}
 await runBrevitySdkAgent({prompt:messages,requestInstructions:'Authenticated member: Larry.',model:'test',schema,canonical,browser:{},runner,logger:()=>{}})
})

test('missing product evidence returns to the agent for research without making the user a label processor',async()=>{
 let calls=0
 const calculate=async()=>{if(++calls===1)throw Object.assign(new Error('Reference missing'),{code:'NUTRITION_REFERENCE_REQUIRED',foods:['4 oz Eckrich Original sausage']});return {perServingMacros:{calories:380}}}
 const input=JSON.stringify({ingredients:['4 oz Eckrich Original sausage'],yieldQuantity:1,yieldUnit:'meal',allowGenericEstimate:false,productReferences:[]})
 const runner={run:async agent=>{
  const result=JSON.parse(await agent.tools.find(t=>t.name==='estimate_meal_nutrition').invoke({},input))
  assert.deepEqual(result.referenceRequired,['4 oz Eckrich Original sausage'])
  assert.equal(result.estimateId,null)
  assert.match(result.notice,/Use web_search/)
  const researched=JSON.parse(await agent.tools.find(t=>t.name==='estimate_meal_nutrition').invoke({},input))
  assert.ok(researched.estimateId)
  return {finalOutput:{message:'Ready for review',proposal:null}}
 }}
 const result=await runBrevitySdkAgent({prompt:'Calculate my sausage',model:'test',schema,canonical,browser:{},calculate,findSources:async()=>[],runner,logger:()=>{}})
 assert.equal(result.output.message,'Ready for review')
 assert.equal(result.estimates.size,1)
})


test('completed estimate with an omitted review gets one bounded proposal repair using existing tool history',async()=>{
 let calls=0
 const runner={run:async(agent,input,options)=>{
  if(++calls===1){
   await agent.tools.find(t=>t.name==='estimate_meal_nutrition').invoke({},JSON.stringify({ingredients:['2 eggs'],yieldQuantity:1,yieldUnit:'meal',allowGenericEstimate:false,productReferences:[]}))
   return {history:[{role:'user',content:'Prepare my meal review.'}],finalOutput:{message:'Review prepared',proposal:null}}
  }
  assert.equal(options.maxTurns,4)
  assert.equal(input.at(-1).role,'system')
  assert.match(input.at(-1).content,/Preparing review is not saving/)
  return {finalOutput:{message:'Ready to review; not saved',proposal:{summary:'Review meal',operations:[]}}}
 }}
 const result=await runBrevitySdkAgent({prompt:'Prepare my meal review.',model:'test',schema,canonical,browser:{},calculate:async()=>({perServingMacros:{calories:140}}),runner,logger:()=>{}})
 assert.equal(calls,2)
 assert.ok(result.output.proposal)
 assert.equal(result.estimates.size,1)
})

test('agent can inspect real product evidence before calculation and reuse its private cache',async()=>{
 let fetches=0
 const referenceFetcher=async url=>{
  fetches++
  if(url.endsWith('/missing'))throw Error('No readable label')
  return {sourceUrl:url,html:'Nutrition Facts Serving Size 1 bottle Calories 160 Protein 30g Total Fat 3g Total Carbohydrate 4g'}
 }
 const agent=createBrevitySdkAgent({model:'test',schema,canonical,browser:{},referenceFetcher,calculate:async(input,options)=>{
  const {retrieveNutritionReferences}=await import('../../netlify/lib/meal-nutrition.mjs')
  const evidence=await retrieveNutritionReferences(input.productReferences,options)
  assert.match(evidence[0].details,/Protein 30g/)
  assert.doesNotMatch(evidence[0].details,/invented/)
  return {perServingMacros:{calories:160,proteinGrams:30}}
 }})
 const reader=agent.tools.find(item=>item.name==='read_product_nutrition')
 assert.equal(reader.parameters.properties.urls.items.format,undefined)
 const read=JSON.parse(await reader.invoke({},JSON.stringify({urls:['https://example.com/product','https://example.com/missing']})))
 assert.equal(read.references.length,1)
 assert.equal(read.failures[0].reason,'No readable label')
 const result=JSON.parse(await agent.tools.find(t=>t.name==='estimate_meal_nutrition').invoke({},JSON.stringify({ingredients:['1 Example shake'],yieldQuantity:1,yieldUnit:'meal',allowGenericEstimate:false,productReferences:[{url:'https://example.com/product',details:'invented'}]})))
 assert.equal(fetches,2)
 assert.ok(result.estimateId)
 assert.equal(result.logged,false)
})

test('focused product discovery verifies candidates and shares only its product query with research',async()=>{
 const queries=[]
 const agent=createBrevitySdkAgent({model:'test',schema,canonical,browser:{},findSources:async(product,options)=>{
  queries.push({product,options})
  return ['https://example.com/exact-product']
 },referenceFetcher:async url=>({sourceUrl:url,html:'Nutrition Facts Serving Size 2 oz Calories 190 Protein 6g Total Fat 15g Total Carbohydrates 5g'})})
 const finder=agent.tools.find(item=>item.name==='find_product_nutrition')
 const result=JSON.parse(await finder.invoke({},JSON.stringify({product:'Example Original sausage'})))
 assert.deepEqual(queries,[{product:'Example Original sausage',options:{model:'test'}}])
 assert.match(result.references[0].details,/Total Carbohydrates 5g/)
 assert.deepEqual(result.failures,[])
})

test('product source discovery has bounded research and filters invalid candidate URLs',async()=>{
 const {findProductNutritionSources}=await import('../../netlify/lib/product-nutrition-research.mjs')
 const result=await findProductNutritionSources('Example Vanilla 11 fl oz',{model:'test',runner:{run:async(agent,input,options)=>{
  assert.equal(options.maxTurns,4)
  assert.equal(agent.modelSettings.store,false)
  assert.equal(agent.modelSettings.toolChoice,'required')
  assert.deepEqual(agent.tools.map(tool=>tool.name),['web_search'])
  assert.equal(input[0].content[0].text,'Example Vanilla 11 fl oz')
  return {finalOutput:{urls:['https://example.com/product','https://example.com/product','http://example.com/other']}}
 }}})
 assert.deepEqual(result,['https://example.com/product'])
})

test('failed source discovery retries once with failed URLs before returning unavailable',async()=>{
 const queries=[],fetches=[],events=[]
 const agent=createBrevitySdkAgent({model:'test',schema,canonical,browser:{},onTool:event=>events.push(event),findSources:async(product,options)=>{
  queries.push(options)
  return options.unavailableUrls?['https://example.com/missing','https://example.com/readable']:['https://example.com/missing']
 },referenceFetcher:async url=>{
  fetches.push(url)
  if(url.endsWith('missing'))throw Error('No readable label')
  return {sourceUrl:url,html:'Nutrition Facts Serving Size 2 oz Calories 190 Protein 6g Total Fat 15g Total Carbohydrates 5g'}
 }})
 const result=JSON.parse(await agent.tools.find(tool=>tool.name==='find_product_nutrition').invoke({},JSON.stringify({product:'Example Original sausage'})))
 assert.equal(queries.length,2)
 assert.deepEqual(queries[1].unavailableUrls,['https://example.com/missing'])
 assert.deepEqual(fetches,['https://example.com/missing','https://example.com/readable'])
 assert.equal(result.references.length,1)
 assert.equal(result.failures.length,1)
 assert.ok(events.includes('find_product_nutrition_retry'))
})

test('calculator recovers a mismatched product reference without another member turn',async()=>{
 const calls=[],research=[]
 const input={ingredients:['6 oz Example Original sausage'],yieldQuantity:1,yieldUnit:'meal',allowGenericEstimate:false,productReferences:[{url:'https://example.com/other-variant',details:'Other variant'}]}
 const agent=createBrevitySdkAgent({model:'test',schema,canonical,browser:{},calculate:async request=>{
  calls.push(request)
  if(calls.length===1)throw Object.assign(Error('Wrong variant'),{code:'NUTRITION_REFERENCE_REQUIRED',foods:input.ingredients})
  assert.equal(request.allowGenericEstimate,false)
  assert.equal(request.productReferences[0].url,'https://example.com/original')
  return {perServingMacros:{calories:570,proteinGrams:18}}
 },findSources:async(product,options)=>{research.push({product,options});return ['https://example.com/original']},referenceFetcher:async url=>({sourceUrl:url,html:'Nutrition Facts Serving Size 2 oz Calories 190 Protein 6g Total Fat 15g Total Carbohydrates 5g'})})
 const result=JSON.parse(await agent.tools.find(t=>t.name==='estimate_meal_nutrition').invoke({},JSON.stringify(input)))
 assert.equal(calls.length,2)
 assert.deepEqual(research[0].options.unavailableUrls,['https://example.com/other-variant'])
 assert.ok(result.estimateId)
 assert.equal(result.logged,false)
})

test('invalid proposal gets one production-contract repair before leaving the agent',async()=>{
 let calls=0,validations=0
 const result=await runBrevitySdkAgent({model:'test',schema,canonical:{supplementalSources:{}},browser:{},prompt:'Correct my breakfast',logger:()=>{},validateOutput:()=>{if(++validations===1)throw Error('Wrong member target')},runner:{run:async(_agent,input)=>{
  calls++
  if(calls===2)assert.match(JSON.stringify(input),/targetId MUST be the signed-in MEMBER/)
  return {finalOutput:{message:'Review',proposal:{operations:[]}}}
 }}})
 assert.equal(calls,2);assert.equal(validations,2);assert.ok(result.output.proposal)
})

 test('SDK review tool retains validated proposal even when final response omits it',async()=>{
 const proposal={summary:'Inspect garage',operations:[{type:'assignment.create',description:'Inspect garage',targetId:'',targetDate:'2026-09-28',payloadJson:'{"title":"Inspect garage","owner":"Larry"}',allowedScopes:['this-item'],defaultScope:'this-item'}]}
 let validations=0
 const result=await runBrevitySdkAgent({model:'test',schema:assistantResponseSchema,canonical,browser:{},prompt:'Create an assignment',logger:()=>{},validateOutput:()=>validations++,runner:{run:async agent=>{
  const tool=agent.tools.find(tool=>tool.name==='prepare_action_review')
  const review=JSON.parse(await tool.invoke({},JSON.stringify(proposal)))
  assert.equal(review.saved,false);assert.equal(review.validForReview,true)
  return {get finalOutput(){return {message:'Review the assignment',proposal:null}}}
 }}})
 assert.deepEqual(result.output.proposal,proposal);assert.equal(validations,2)
 })

test('saved household search locates improvement records by title without invented targets',async()=>{
 const agent=createBrevitySdkAgent({model:'test',schema,canonical:{actionRecords:{improvementProposals:[{id:'voice-recovery',title:'Voice recovery',stage:'proposed'}],projects:[{id:'garage',title:'Garage door'}]},dailyPlan:{assignments:[]}},browser:{}})
 const search=agent.tools.find(tool=>tool.name==='search_household_records')
 const result=JSON.parse(await search.invoke({},JSON.stringify({query:'Voice recovery'})))
 assert.deepEqual(result.matches,[{kind:'improvement',record:{id:'voice-recovery',title:'Voice recovery',stage:'proposed'}}])
 const absent=JSON.parse(await search.invoke({},JSON.stringify({query:'unrecorded request'})))
 assert.deepEqual(absent.matches,[])
})

test('explicit preference tool binds the authenticated member and retains review without applying it',async()=>{
 const reviews=[],validations=[]
 const agent=createBrevitySdkAgent({model:'test',schema:assistantResponseSchema,canonical:{signedInMember:'Larry'},browser:{},preparedReviews:reviews,validateOutput:output=>validations.push(output)})
 const result=JSON.parse(await agent.tools.find(tool=>tool.name==='remember_member_preference').invoke({},JSON.stringify({category:'communication',value:'Prefer brief spoken answers'})))
 assert.equal(result.saved,false)
 assert.equal(result.validForReview,true)
 assert.equal(reviews.length,1)
 assert.equal(validations.length,1)
 assert.equal(reviews[0].operations[0].targetId,'Larry')
 assert.equal(reviews[0].operations[0].type,'member.preference.set')
})

test('consumed meal search preserves member ownership instead of returning an ownerless match',async()=>{
 const agent=createBrevitySdkAgent({model:'test',schema,canonical:{signedInMember:'Larry',recentNutrition:[{date:'2026-09-28',entries:[{id:'b',member:'Larry',name:'Breakfast'}]}]},browser:{}})
 const result=JSON.parse(await agent.tools.find(tool=>tool.name==='search_meal_records').invoke({},JSON.stringify({query:'Breakfast'})))
 assert.equal(result.consumedMember,'Larry')
 assert.equal(result.matches[0].member,'Larry')
 assert.match(result.notice,/never another member/)
})
