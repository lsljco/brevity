import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeActionProposal,permissionForOperation} from '../../netlify/lib/assistant-action-contract.mjs'
import {applyRecordOperation,resourceForOperation} from '../../netlify/lib/assistant-action-executor.mjs'
import {IMPROVEMENT_RESOURCE} from '../../netlify/lib/improvement-workflow.mjs'
const payload={title:'Voice recovery',problem:'User reports stalled voice',evidence:'Reported by user; not a measured failure rate',solution:'Restart after a failed request',benefit:'Hands-free continuation',risks:'Duplicate submission',successMetric:'No duplicate submissions in the recovery evaluation'}
const propose=()=>normalizeActionProposal({summary:'Propose voice recovery',operations:[{type:'improvement.propose',payload}]},{member:'Larry',role:'admin'}).operations[0]
const transition=(id,stage,extra={})=>normalizeActionProposal({summary:'Review improvement',operations:[{type:'improvement.transition',targetId:id,payload:{stage,notes:'Explicit reviewed stage change',...extra}}]},{member:'Larry',role:'admin'}).operations[0]
const context={actor:'Larry',now:()=>new Date('2026-09-29T01:00:00Z')}
test('improvement uses a dedicated governed record and cannot skip approval/evidence stages',()=>{
 const op=propose();assert.equal(resourceForOperation(op),IMPROVEMENT_RESOURCE)
 let records=applyRecordOperation([],op,()=> 'idea',context).after
 assert.equal(records[0].stage,'proposed');assert.equal(records[0].createdBy,'Larry')
 assert.throws(()=>applyRecordOperation(records,transition('idea','release-approved'),()=>'',context),/preceding review/)
 records=applyRecordOperation(records,transition('idea','concept-approved'),()=>'',context).after
 assert.throws(()=>transition('idea','prototype-ready'),/prototype requires/)
 records=applyRecordOperation(records,transition('idea','prototype-ready',{previewUrl:'https://example.com/preview',commitSha:'a'.repeat(40),evaluationSummary:'Synthetic fixture: tests passed'}),()=>'',context).after
 const approval=transition('idea','release-approved');assert.equal(approval.risk,'strong-confirmation')
 records=applyRecordOperation(records,approval,()=>'',context).after
 assert.equal(records[0].stage,'release-approved');assert.equal(records[0].history.length,4)
 assert.equal(records[0].publishedAt,undefined)
 assert.throws(()=>transition('idea','release-approved',{commitSha:'b'.repeat(40)}),/only in a prototype-ready review/)
})
test('only Larry or Lorenzo with planning access can advance improvements',()=>{
 const operation=transition('idea','concept-approved'),currentRecord={id:'idea',stage:'proposed'}
 assert.equal(permissionForOperation({operation,currentRecord,member:'Terica',role:'member',permissions:{planning:true}}).allowed,false)
 assert.equal(permissionForOperation({operation,currentRecord,member:'Lorenzo',role:'member',permissions:{planning:true}}).allowed,true)
 assert.equal(permissionForOperation({operation,currentRecord,member:'Lorenzo',role:'member',permissions:{planning:false}}).allowed,false)
})
