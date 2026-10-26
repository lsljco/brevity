import test from 'node:test'
import assert from 'node:assert/strict'
import {saveLocalAlignmentDraft,loadLocalAlignmentDraft} from './dailyPlanLocalDraft.js'
import {sermonDevotionForDate} from './sermonDevotion.js'

test('retained local plan cannot restore old sermon devotion after replacement',()=>{
  const values=new Map(),storage={setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k)}
  const old={date:'2026-10-26',version:1,spiritual:{sermonSource:{activeVersion:2,sourceHash:'a',sermonDate:'2026-10-18'},devotionFocus:'Old Day 7'},health:{dinner:'Keep my dinner edit'}}
  saveLocalAlignmentDraft(storage,old,1)
  const notes={sevenDayFormationPlan:Array.from({length:7},(_,i)=>({title:`New Day ${i+1}`}))}
  const fresh={...old,health:{dinner:'Server dinner'},spiritual:{sermonSource:{activeVersion:3,sourceHash:'b',sermonDate:'2026-10-25'},sermonNotes:notes,devotionFocus:'New Day 1'}}
  const restored=loadLocalAlignmentDraft(storage,fresh,1)
  assert.equal(restored.spiritual.devotionFocus,'New Day 1')
  assert.equal(restored.health.dinner,'Keep my dinner edit')
  assert.equal(sermonDevotionForDate({notes,source:restored.spiritual.sermonSource,targetDate:restored.date}).dayNumber,1)
  assert.equal(loadLocalAlignmentDraft(storage,old,1).spiritual.devotionFocus,'Old Day 7')
})
