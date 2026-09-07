import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8')
const planner=readFileSync(new URL('./FinancePlanner.jsx',import.meta.url),'utf8')
const meetings=readFileSync(new URL('./FinanceMeetingsWorkspace.jsx',import.meta.url),'utf8')

test('finance greeting receives the authenticated household member',()=>{
  assert.match(app,/FinancePlanner[^>]+currentMember=\{currentMember\}/)
  assert.match(planner,/\{getGreeting\(\)\}, \{currentMember\}/)
  assert.doesNotMatch(planner,/\{getGreeting\(\)\}, Larry/)
})

test('meeting-created text exposes editors and records the editing member',()=>{
  for(const label of ['Commitment text','Correction name','Correction rationale','Meeting summary','Meeting notes','Meeting transcript','Brevity meeting summary'])assert.match(meetings,new RegExp(`aria-label="${label}"`))
  assert.match(meetings,/updatedBy:currentMember/)
  assert.match(meetings,/updatedAt:new Date\(\)\.toISOString\(\)/)
})
