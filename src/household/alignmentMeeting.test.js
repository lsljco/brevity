import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { applyAlignmentMeetingResult, normalizeAlignmentMeetingResult } from './alignmentMeeting.js'
import { createEmptyDailyPlan } from './dailyPlan.js'

test('alignment meeting analysis normalizes only supported Seven Pillars fields',()=>{
  const result=normalizeAlignmentMeetingResult({summary:'  Ready  ',unresolved:[' Owner? '],changes:{fitness:{participants:['Javin','Unknown'],stepGoal:'9000'},household:{priorities:['Clean kitchen']}}})
  assert.equal(result.summary,'Ready')
  assert.deepEqual(result.unresolved,['Owner?'])
  assert.deepEqual(result.changes.fitness.participants,['Javin'])
  assert.equal(result.changes.fitness.stepGoal,9000)
  assert.deepEqual(result.changes.household.priorities,['Clean kitchen'])
})

test('alignment meeting suggestions merge non-empty values without erasing the current plan',()=>{
  const plan=createEmptyDailyPlan('2026-09-15')
  plan.health.breakfast='Existing breakfast'
  plan.health.dinner='Existing dinner'
  plan.fitness.stepGoal=12000
  const next=applyAlignmentMeetingResult(plan,{changes:{health:{lunch:'Turkey sandwich'},fitness:{participants:['Nyla']},household:{priorities:['Call contractor']}}})
  assert.equal(next.health.breakfast,'Existing breakfast')
  assert.equal(next.health.lunch,'Turkey sandwich')
  assert.equal(next.health.dinner,'Existing dinner')
  assert.equal(next.fitness.stepGoal,12000)
  assert.deepEqual(next.fitness.participants,['Nyla'])
  assert.equal(next.household.priorities[0].title,'Call contractor')
})

test('member alignment analysis cannot alter protected Finance fields',()=>{
  const plan=createEmptyDailyPlan('2026-09-15')
  plan.finance.bills=[{id:'mortgage',title:'Mortgage',status:'pending'}]
  const next=applyAlignmentMeetingResult(plan,{changes:{finance:{bills:['Replace mortgage']},ministry:{contentFocus:'Prayer'}}},{financeReadOnly:true})
  assert.equal(next.finance.bills[0].title,'Mortgage')
  assert.equal(next.ministry.contentFocus,'Prayer')
})

test('Today and Tomorrow alignment screens expose meeting capture while preserving Action Mode completion',()=>{
  const source=readFileSync(new URL('./MorningAlignment.jsx',import.meta.url),'utf8')
  const capture=readFileSync(new URL('./AlignmentMeetingCapture.jsx',import.meta.url),'utf8')
  const endpoint=readFileSync(new URL('../../netlify/functions/alignment-meeting-analyze.mjs',import.meta.url),'utf8')
  assert.match(source,/AlignmentMeetingCapture plan=\{draft\} timing=\{timing\}/)
  assert.match(source,/applyAlignmentMeetingResult\(current,result,\{financeReadOnly\}\)/)
  assert.match(source,/Review & Complete Alignment/)
  for(const label of ['Start Meeting','End Meeting','Import Otter','Save recording','Analyze with Brevity','Apply Suggestions to Draft'])assert.match(capture,new RegExp(label))
  assert.match(endpoint,/readSession\(event\)/)
  assert.match(endpoint,/proposed local draft and does not change the shared plan/)
})
