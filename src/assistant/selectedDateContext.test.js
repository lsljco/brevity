import test from 'node:test'
import assert from 'node:assert/strict'
import {buildAssistantContext} from './assistantContext.js'

test('viewed plan date is separate from the current date and does not manufacture historical records',()=>{
  const context=buildAssistantContext({storage:{getItem:()=>null},member:'Larry',activeView:'today',selectedDate:'2026-02-17',now:new Date('2026-10-23T12:00:00Z')})
  assert.equal(context.currentPage.selectedDate,'2026-02-17')
  assert.match(context.currentPage.dateScopeNotice,/retrieve its saved records/)
  assert.equal(context.generatedAt,'2026-10-23T12:00:00.000Z')
  assert.equal(context.dailyPlans,undefined)
})
