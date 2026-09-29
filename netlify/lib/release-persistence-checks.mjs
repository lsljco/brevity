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
 return{passed:true,checks,syntheticData:true,productionWrites:false,scope:'Real action executor and persistence; no browser confirmation interaction.'}
}
