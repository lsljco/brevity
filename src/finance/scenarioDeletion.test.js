import test from 'node:test'
import assert from 'node:assert/strict'
import {deleteScenario,scenarioCollection} from './scenarioDeletion.js'
import {cloneDefaultScenarioModel} from './scenarioModelingData.js'
import {normalizeActionProposal,permissionForOperation} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation,resourceForOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {ALL_WORK_SCENARIOS} from './workScenarios.js'
test('scenario deletion removes exactly one kind and preserves the complete Undo snapshot',()=>{
 const source={studioPlans:[{id:'same',assumptions:{title:'Studio'}}],scenarios:[{id:'same',title:'Income',incomes:[]}],recoveryPlans:[{id:'same',title:'Recovery'}],studioDefaultFloor:24000,unrelated:{value:true}}
 for(const kind of Object.keys(scenarioCollection)){
  const proposal=normalizeActionProposal({operations:[{type:'forecast.update',targetId:'same',payload:{scenarioAction:'delete',scenarioKind:kind}}]},{member:'Larry',role:'admin'})
  const op=proposal.operations[0]
  assert.equal(resourceForOperation(op),'shared:brevity_finance_scenarios_v1')
  assert.equal(permissionForOperation({operation:op,member:'Nyla',role:'member',permissions:{finance:true}}).allowed,false)
  const {before,after}=applyRecordOperation(source,op)
  assert.deepEqual(before,source);assert.equal(after[scenarioCollection[kind]].length,0)
  for(const other of Object.keys(scenarioCollection).filter(k=>k!==kind))assert.deepEqual(after[scenarioCollection[other]],source[scenarioCollection[other]])
  assert.deepEqual(after.unrelated,source.unrelated);assert.equal(after.studioDefaultFloor,24000)
  assert.throws(()=>deleteScenario(after,'same',kind),/no longer exists/)
 }
 assert.equal(source.studioPlans.length,1)
})
test('last income scenario stays empty and deleted recovery templates stay dismissed',()=>{
 assert.equal(deleteScenario(null,cloneDefaultScenarioModel().scenarios[0].id,'income').scenarios.length,cloneDefaultScenarioModel().scenarios.length-1)
 let model={scenarios:[{id:'last',incomes:[]}]}
 model=deleteScenario(model,'last','income');assert.deepEqual(model.scenarios,[])
 assert.throws(()=>deleteScenario(model,cloneDefaultScenarioModel().scenarios[0].id,'income'),/no longer exists/)
 const id=ALL_WORK_SCENARIOS[0].id
 const removed=deleteScenario({},id,'recovery')
 assert.ok(removed.deletedScenarios.includes('recovery:'+id));assert.deepEqual(removed.recoveryPlans,[])
 assert.throws(()=>deleteScenario({},'unknown','recovery'),/no longer exists/)
})
test('deletion cannot be mixed with an edit or target the entire model',()=>{
 for(const operation of [{targetId:'model',payload:{scenarioAction:'delete',scenarioKind:'studio'}},{targetId:'one',payload:{scenarioAction:'delete',scenarioKind:'studio',title:'Change'}},{targetId:'one',payload:{scenarioAction:'delete',scenarioKind:'unknown'}}])assert.throws(()=>normalizeActionProposal({operations:[{type:'forecast.update',...operation}]}))
})
