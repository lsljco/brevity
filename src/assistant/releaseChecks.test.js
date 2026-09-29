import test from 'node:test'
import assert from 'node:assert/strict'
import {releaseCheckAccess} from '../../netlify/lib/release-check-access.mjs'
import {evaluateHouseholdCase,evaluationCases} from '../../netlify/lib/household-agent-evaluation.mjs'
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
