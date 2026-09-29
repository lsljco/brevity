import {createConversationRepository} from './assistant-conversation-store.mjs'
import {createUsageRepository} from './usage-metrics.mjs'
import assert from 'node:assert/strict'
import {createAssistantActionRepository} from './assistant-action-repository.mjs'
import {createProductionActionResources,captureExpectedVersions,executeRecordOperations} from './assistant-action-executor.mjs'
import {normalizeActionProposal,defaultActionPermissions} from './assistant-action-contract.mjs'
import {executeActionWithJournal,undoActionWithJournal} from '../functions/brevity-assistant-actions.mjs'
import {dailyNutrition} from './nutrition-ledger.mjs'

// The caller supplies a dedicated fixture store. Every resource, including journals,
// is namespaced to one run; production store factories are never used here.
export async function verifyReleasePersistence({store,runId}){
 if(!/^[a-f0-9-]{36}$/.test(runId||''))throw Error('A unique release run is required.')
 const scoped=area=>Object.fromEntries(['get','getWithMetadata','setJSON'].map(method=>[method,(key,...args)=>store[method](`${runId}/${area}/${key}`,...args)]))
 const makeResources=()=>createProductionActionResources({sharedStore:scoped('shared'),planStore:scoped('plans'),mealStore:scoped('meals'),sermonStore:scoped('sermons')})
 const resources=makeResources(),repository=createAssistantActionRepository({store:scoped('actions')})
 const session={member:'Larry',role:'admin'},permissions=defaultActionPermissions('admin'),date='2026-09-28',resource=`nutrition:Larry:${date}`,checks={}
 const estimate={ingredients:[{input:'Synthetic fixture food',amountDescription:'1 serving'}],perServingMacros:{calories:200,proteinGrams:20,carbohydrateGrams:12,fatGrams:8},warnings:['Release fixture only'],nutritionBasis:'Synthetic test'}
 const prepare=async(type,payload)=>captureExpectedVersions(normalizeActionProposal({summary:'Isolated release verification',operations:[{type,description:'Synthetic fixture',targetId:'Larry',targetDate:date,payload}]},session),resources)
 const execute=async proposal=>{if(!await repository.getProposal(proposal.id))await repository.saveProposal(proposal);return executeActionWithJournal({repository,proposal,operations:proposal.operations,session,permissions,resources,event:{},calendarRequestFn:async()=>{throw Error('External writes are forbidden in release checks.')}})}
 const read=async()=>dailyNutrition((await makeResources().read(resource)).value,'Larry',date)
 const initial=await prepare('nutrition.meal.log',{name:'Release fixture',estimateJson:JSON.stringify(estimate)})
 assert.equal((await read()).entries.length,0);checks.noWriteBeforeExecution=true
 const saved=await execute(initial)
 const first=await read();assert.equal(first.entries.length,1);assert.equal(first.totals.proteinGrams,20);checks.persistedSave=true
 const repeated=await execute(initial);assert.equal(repeated.audit.id,saved.audit.id);assert.equal((await read()).entries.length,1);checks.idempotentRetry=true
 const updatedEstimate={...estimate,perServingMacros:{calories:300,proteinGrams:30,carbohydrateGrams:18,fatGrams:12}}
 const correction=await prepare('nutrition.meal.update',{entryId:first.entries[0].id,name:'Corrected fixture',...updatedEstimate.perServingMacros,estimateJson:JSON.stringify(updatedEstimate),reason:'Synthetic portion correction'})
 const stale=await prepare('nutrition.meal.update',{entryId:first.entries[0].id,name:'Stale fixture',...estimate.perServingMacros,estimateJson:JSON.stringify(estimate),reason:'Stale version probe'})
 const corrected=await execute(correction);assert.equal((await read()).totals.proteinGrams,30);checks.persistedCorrection=true
 await assert.rejects(()=>execute(stale),/changed|version|newer|conflict/i);assert.equal((await read()).totals.proteinGrams,30);checks.staleWriteRejected=true
 const forged={...initial,operations:initial.operations.map(operation=>({...operation,targetId:'Lorenzo'})),expectedVersions:{[`nutrition:Lorenzo:${date}`]:0}}
 await assert.rejects(()=>executeRecordOperations({proposal:forged,session,permissions,resources}),/own meals/);checks.crossMemberWriteRejected=true
 await undoActionWithJournal({repository,auditId:corrected.audit.id,session,resources,event:{}})
 assert.equal((await read()).totals.proteinGrams,20);assert.equal((await read()).entries[0].name,'Release fixture');checks.persistedUndo=true
 const audit=await repository.getAudit(corrected.audit.id);assert.equal(audit.actor,'Larry');assert.ok(audit.operations.length);checks.auditPreserved=true
 for(const [pillar,patch] of Object.entries({fitness:{workout:'Fixture walk'},education:{isaiah:{readingMinutes:23}},spiritual:{devotionFocus:'Fixture gratitude'},ministry:{contentFocus:'Fixture welcome'}})){
  const proposal=await captureExpectedVersions(normalizeActionProposal({summary:'Isolated pillar verification',operations:[{type:'plan.pillar.update',description:'Synthetic pillar change',targetId:pillar,targetDate:date,payload:{pillar,patch}}]},session),resources)
  const before=(await resources.read(`plan:${date}`)).value
  const applied=await execute(proposal)
  const after=(await makeResources().read(`plan:${date}`)).value
  for(const [key,value] of Object.entries(patch))if(key==='isaiah')assert.equal(after[pillar].isaiah.readingMinutes,23);else assert.deepEqual(after[pillar][key],value)
  await undoActionWithJournal({repository,auditId:applied.audit.id,session,resources,event:{}})
  const restored=(await makeResources().read(`plan:${date}`)).value
  assert.deepEqual(restored?.[pillar],before?.[pillar]);checks[`${pillar}PlanSaveAndUndo`]=true
 }
 const improvement=await captureExpectedVersions(normalizeActionProposal({summary:'Isolated improvement proposal',operations:[{type:'improvement.propose',payload:{title:'Fixture improvement',problem:'Synthetic friction',evidence:'Synthetic reported issue',solution:'Fixture remedy',benefit:'Reduced friction',risks:'Fixture regression',successMetric:'Fixture acceptance passes'}}]},session),resources)
 await execute(improvement)
 const improvementResource='shared:brevity_improvement_proposals_v1',idea=(await makeResources().read(improvementResource)).value[0]
 const approval=await captureExpectedVersions(normalizeActionProposal({summary:'Isolated concept approval',operations:[{type:'improvement.transition',targetId:idea.id,payload:{stage:'concept-approved',notes:'Synthetic approval only'}}]},session),resources)
 const approved=await execute(approval);assert.equal((await makeResources().read(improvementResource)).value[0].stage,'concept-approved')
 await assert.rejects(()=>undoActionWithJournal({repository,auditId:approved.audit.id,session:{member:'Terica',role:'admin'},resources,event:{}}),/Larry or Lorenzo/)
 await undoActionWithJournal({repository,auditId:approved.audit.id,session,resources,event:{}})
 assert.equal((await makeResources().read(improvementResource)).value[0].stage,'proposed');checks.improvementApprovalSaveAndUndo=true
 const preference=await prepare('member.preference.set',{category:'communication',value:'Prefer short answers'})
 const preferenceSaved=await execute(preference)
 assert.equal((await makeResources().read('member-context:Larry')).value.preferences.communication,'Prefer short answers')
 assert.deepEqual((await makeResources().read('member-context:Lorenzo')).value.preferences,{})
 await assert.rejects(()=>undoActionWithJournal({repository,auditId:preferenceSaved.audit.id,session:{member:'Lorenzo',role:'admin'},resources,event:{}}),/own preference/)
 const forgedPreference={...preference,operations:preference.operations.map(operation=>({...operation,targetId:'Lorenzo'})),expectedVersions:{'member-context:Lorenzo':0}}
 await assert.rejects(()=>executeRecordOperations({proposal:forgedPreference,session,permissions,resources}),/own preferences/)
 await undoActionWithJournal({repository,auditId:preferenceSaved.audit.id,session,resources,event:{}})
 assert.deepEqual((await makeResources().read('member-context:Larry')).value.preferences,{})
 checks.memberPreferenceSaveIsolationAndUndo=true

 for(const spec of [
  {name:'activitySaveAndUndo',type:'activity.record',targetId:'Larry',payload:{kind:'workout',title:'Fixture walk',durationMinutes:30},resource:`activity:Larry:${date}`,verify:value=>assert.equal(value.entries[0].durationMinutes,30)},
  {name:'learningEvidenceSaveAndUndo',type:'education.observation.record',targetId:'Isaiah',payload:{observations:[{skillId:'fixture-skill',activityId:'fixture-reading',result:'prompted'}]},resource:'shared:brevity_education_isaiah_v1',verify:value=>assert.ok(value.sessions.length>0)},
  {name:'moduleConfigurationSaveAndUndo',type:'module.configuration.update',targetId:'household-modules',payload:{modules:[{id:'custom-fixture',label:'Fixture notes',pillarId:'household'}]},resource:'shared:brevity_modules_v1',verify:value=>assert.equal(value[0].id,'custom-fixture')},
 ]){
  const proposal=await captureExpectedVersions(normalizeActionProposal({summary:'Isolated extension verification',operations:[{type:spec.type,targetId:spec.targetId,targetDate:date,payload:spec.payload}]},session),resources)
  const before=(await resources.read(spec.resource)).value,applied=await execute(proposal)
  spec.verify((await makeResources().read(spec.resource)).value)
  await undoActionWithJournal({repository,auditId:applied.audit.id,session,resources,event:{}})
  assert.deepEqual((await makeResources().read(spec.resource)).value,before);checks[spec.name]=true
 }
 const conversations=()=>createConversationRepository({store:scoped('conversations')})
 await conversations().appendTurn('Larry',{version:0,turnId:'fixture-turn',user:{role:'user',content:'Fixture question'},assistant:{role:'assistant',content:'Fixture answer'}})
 assert.equal((await conversations().read('Larry')).messages.length,2)
 assert.equal((await conversations().read('Lorenzo')).messages.length,0)
 await assert.rejects(()=>conversations().clear('Larry',0),error=>error.status===409)
 const cleared=await conversations().clear('Larry',1);assert.equal(cleared.messages.length,0)
 assert.equal((await conversations().restore('Larry',cleared.version)).messages.length,2);checks.conversationPersistenceConflictIsolationAndRestore=true
 const usage=()=>createUsageRepository({store:scoped('usage')})
 await usage().record('Larry',{id:'fixture-request',kind:'assistant',outcome:'answered'})
 await usage().record('Larry',{id:'fixture-request',kind:'assistant',outcome:'answered'})
 assert.equal((await usage().summary(['Larry'])).members[0].requests,1)
 assert.equal((await usage().summary(['Lorenzo'])).members[0].requests,0);checks.usagePersistenceDeduplicationAndIsolation=true
 return{passed:true,checks,syntheticData:true,productionWrites:false,scope:'Real action executor and persistence; no browser confirmation interaction.'}
}
