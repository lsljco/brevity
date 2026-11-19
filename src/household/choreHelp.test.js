import test from 'node:test'
import assert from 'node:assert/strict'
import {buildHouseholdMaintenanceWeek,choreCompletionCredit,householdOperationCalendarEvent,canSubmitHouseholdChore} from './householdMaintenanceData.js'
import {householdPermissionForOperation,householdRecordForOperation,applyHouseholdRecordOperation} from './householdActionModel.js'
import {maintenanceCompletionOperation,maintenanceCoverageOperation,maintenanceChoreDeleteOperation} from './householdActionReview.js'
import {normalizeActionOperation,permissionForOperation} from '../../netlify/lib/assistant-action-contract.mjs'
const date='2026-11-19'
function chore(owner){return buildHouseholdMaintenanceWeek(date,{customChores:[{id:'help',title:'Shared chore help',date,owners:[owner],details:['Clean and reset'],zone:'Kitchen',signoffRequired:true}]}).flatMap(d=>d.tasks).find(t=>t.title==='Shared chore help')}
test('every sibling may complete a peer chore without gaining review or ownership permissions',()=>{
 for(const actor of ['Nyla','Javin','Isaiah'])for(const owner of ['Nyla','Javin','Isaiah'].filter(x=>x!==actor)){
  const task=chore(owner),operation=maintenanceCompletionOperation(task,'submit','',[0]),record=householdRecordForOperation({customChores:[{...task,id:'help',date}]},operation)
  assert.equal(permissionForOperation({operation,member:actor,role:'member',permissions:{planning:false},currentRecord:record}).allowed,true)
  for(const action of ['approve','return','reopen'])assert.equal(householdPermissionForOperation({operation:maintenanceCompletionOperation(task,action,'Reason'),member:actor,role:'member',currentRecord:record}).allowed,false)
  assert.equal(householdPermissionForOperation({operation:maintenanceCoverageOperation(task,actor),member:actor,role:'member',currentRecord:record}).allowed,false)
  assert.equal(householdPermissionForOperation({operation:maintenanceChoreDeleteOperation(task),member:actor,role:'member',currentRecord:record}).allowed,false)
 }
 assert.equal(canSubmitHouseholdChore({owners:['Larry']},'Nyla'),false)
 assert.equal(canSubmitHouseholdChore(null,'Nyla'),false)
 assert.equal(canSubmitHouseholdChore({owners:['Javin']},'Unknown'),false)
})
test('authenticated helper credit survives sign-off and the original assignment is preserved',()=>{
 const task=chore('Javin'),state={customChores:[{...task,id:'help',date}]},before=structuredClone(state)
 const op=maintenanceCompletionOperation(task,'submit','',[0])
 const submitted=applyHouseholdRecordOperation(state,op,{actor:'Nyla',now:()=>new Date(date+'T16:00:00Z')}).after
 const occurrence=submitted.occurrences[task.occurrenceId]
 assert.equal(occurrence.completedBy,'Nyla');assert.equal(occurrence.submittedBy,'Nyla');assert.equal(occurrence.complete,false)
 assert.equal(occurrence.coveredBy,undefined);assert.equal(occurrence.history.at(-1).by,'Nyla')
 assert.equal(choreCompletionCredit(task,occurrence),'Completed by Nyla for Javin')
 const approved=applyHouseholdRecordOperation(submitted,maintenanceCompletionOperation(task,'approve'),{actor:'Terica'}).after
 assert.equal(approved.occurrences[task.occurrenceId].completedBy,'Nyla')
 assert.equal(approved.occurrences[task.occurrenceId].approvedBy,'Terica')
 assert.match(householdOperationCalendarEvent(task,approved.occurrences[task.occurrenceId]).notes,/Completed by Nyla for Javin/)
 assert.deepEqual(buildHouseholdMaintenanceWeek(date,approved).flatMap(d=>d.tasks).find(t=>t.occurrenceId===task.occurrenceId).owners,['Javin'])
 assert.deepEqual(state,before)
 assert.throws(()=>normalizeActionOperation({...op,payload:{...op.payload,completedBy:'Javin'}}),/unsupported|not allowed/i)
})
