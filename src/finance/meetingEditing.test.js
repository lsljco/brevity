import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8')
const planner=readFileSync(new URL('./FinancePlanner.jsx',import.meta.url),'utf8')
const meetings=readFileSync(new URL('./FinanceMeetingsWorkspace.jsx',import.meta.url),'utf8')
const { canonicalMeetingNameText }=await import('./meetingNames.js')

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

test('meeting commitments repair known household-name transcription errors',()=>{
  assert.equal(canonicalMeetingNameText('Jabin and Tarrica spoke with Tara'),'Javin and Terica spoke with Terica')
  assert.equal(canonicalMeetingNameText('Benjamin met Taran'),'Benjamin met Taran')
  assert.match(meetings,/HOUSEHOLD_MEMBERS\.map\(member=>/)
  assert.match(meetings,/SHARED_STATE_EVENT/)
})

test('finance defaults to the operating account and projected vision',()=>{
  assert.match(planner,/data\.accounts\.find\(account => account\.name === 'Operating Account'\)/)
  assert.match(planner,/return operating \? new Set\(\[operating\.id\]\) : null/)
  assert.match(planner,/onClick=\{\(\) => setSelectedAccts\(new Set\(\[acct\.id\]\)\)\}/)
  assert.match(meetings,/\[visionMode,setVisionMode\]=useState\('projected'\)/)
})

test('transaction filters use responsive non-overlapping columns',()=>{
  assert.match(planner,/grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(planner,/transaction-list-controls\.is-compact \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(planner,/@media \(max-width: 1120px\)[\s\S]*transaction-list-controls\.is-compact \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(planner,/@media \(max-width: 768px\)[\s\S]*transaction-list-controls\.is-compact \{ grid-template-columns: 1fr/)
  assert.doesNotMatch(planner,/className="transaction-list-controls"[^>]+gridTemplateColumns/)
})
