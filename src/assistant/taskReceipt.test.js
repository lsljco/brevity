import test from 'node:test'
import assert from 'node:assert/strict'
import {savedTaskLinks,taskReceiptText} from '../../netlify/lib/task-receipt.mjs'
const task={id:'new-task',date:'2026-10-01',title:'Inspect garage',owner:'Larry'}
const audit={action:'execute',status:'completed',operations:[{type:'assignment.create',targetDate:task.date}],changes:[{resource:`plan:${task.date}`,before:{assignments:[{id:'old'}]},after:{assignments:[{id:'old'},task]}}]}
test('task destinations use committed IDs and dates, excluding existing assignments',()=>{
  assert.deepEqual(savedTaskLinks(audit),[task])
  assert.match(taskReceiptText([task],'Larry'),/2026-10-01/)
  assert.match(taskReceiptText([task],'Larry'),/not added to the calendar/)
})
test('failed, undone, unrelated and update-only actions cannot advertise newly saved tasks',()=>{
  for(const changed of [{status:'failed'},{action:'undo'},{undoneAt:'now'},{operations:[{type:'assignment.update',targetDate:task.date}]},{operations:[{type:'assignment.create',targetDate:'2026-10-02'}]}])assert.deepEqual(savedTaskLinks({...audit,...changed}),[])
})
