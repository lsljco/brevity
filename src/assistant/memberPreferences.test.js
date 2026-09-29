import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeActionProposal,permissionForOperation} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation,resourceForOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {assertActionSourcesAvailable,loadAssistantSupplementalContext} from '../../netlify/lib/assistant-supplemental-context.mjs'
import {validateAgentProposal} from '../../netlify/lib/agent-proposal-validation.mjs'
const proposal=(value='Prefer short spoken answers',targetId='Larry')=>({summary:'Remember preference',operations:[{type:'member.preference.set',targetId,payload:{category:'communication',value}}]})
test('lasting preferences are member-owned, reviewed, bounded and independently removable',()=>{
 const operation=normalizeActionProposal(proposal(),{member:'Larry'}).operations[0]
 assert.equal(resourceForOperation(operation),'member-context:Larry')
 const before={member:'Larry',preferences:{food:'Prefer whole wheat'}}
 const after=applyRecordOperation(before,operation).after
 assert.equal(after.preferences.food,before.preferences.food)
 assert.equal(before.preferences.communication,undefined)
 assert.equal(after.preferences.communication,'Prefer short spoken answers')
 const clear=normalizeActionProposal(proposal(''),{member:'Larry'}).operations[0]
 assert.deepEqual(applyRecordOperation(after,clear).after.preferences,before.preferences)
 assert.equal(permissionForOperation({operation,member:'Lorenzo',role:'admin'}).allowed,false)
 assert.equal(permissionForOperation({operation,member:'Larry',role:'member'}).allowed,true)
 assert.throws(()=>normalizeActionProposal(proposal('a'.repeat(2001)),{member:'Larry'}),/2000/)
 assert.throws(()=>validateAgentProposal({proposal:proposal('Short answers','Lorenzo')},{canonical:{},member:'Larry',estimates:new Map()}),/own preferences/)
 assert.throws(()=>assertActionSourcesAvailable(operation,{supplementalSources:{'member-context':'unavailable'}}),/temporarily unavailable/)
})
test('supplemental context loads only the authenticated member preference resource',async()=>{
 const reads=[]
 const result=await loadAssistantSupplementalContext({canonical:{householdDate:'2026-09-28'},member:'Larry',resources:{read:async resource=>{reads.push(resource);return {value:resource==='member-context:Larry'?{preferences:{food:'Prefer whole wheat'}}:{entries:[]}}}},loadLibrary:async()=>({library:[]}),loadCalendar:async()=>[]})
 assert.deepEqual(result.memberPreferences,{food:'Prefer whole wheat'})
 assert.deepEqual(reads.filter(key=>key.startsWith('member-context:')),['member-context:Larry'])
})

test('agent cannot replace an unreadable calendar event with a made-up plan appointment',()=>{
 const operation={type:'plan.pillar.update',targetId:'household',targetDate:'2026-09-29',payloadJson:JSON.stringify({pillar:'household',patch:{appointments:[{title:'appointment',startTime:'10:00',endTime:'10:30'}]}})}
 assert.throws(()=>validateAgentProposal({proposal:{operations:[operation]}},{canonical:{householdDate:'2026-09-28',supplementalSources:{'apple-calendar':'unavailable'}},member:'Larry',estimates:new Map()}),/not a substitute/)
})
