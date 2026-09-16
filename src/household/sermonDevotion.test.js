import test from 'node:test'
import assert from 'node:assert/strict'
import { applySermonDevotionToSpiritual, sermonArtifactIdFromActive, sermonDevotionForDate, sermonDevotionImageUrl } from './sermonDevotion.js'

const hash='a'.repeat(64)
const notes={documentTitle:'The Cultivation of the Soul',sermonDate:'2026-09-06',sevenDayFormationPlan:Array.from({length:7},(_,index)=>({title:`Formation Day ${index+1}`,scripture:`Mark 4:${index+1}`,paragraphs:[`Focus ${index+1}`],steps:[`Practice ${index+1}`,`Evidence ${index+1}`],discussionPrompts:[`Discuss ${index+1}`]}))}
const source={sermonDate:'2026-09-06',sourceHash:hash,activeVersion:4,title:'The Cultivation of the Soul'}

test('the active sermon maps Sunday through Saturday to its seven reviewed devotions',()=>{
  assert.equal(sermonDevotionForDate({notes,source,targetDate:'2026-09-06'}).title,'Formation Day 1')
  assert.equal(sermonDevotionForDate({notes,source,targetDate:'2026-09-09'}).title,'Formation Day 4')
  assert.equal(sermonDevotionForDate({notes,source,targetDate:'2026-09-12'}).title,'Formation Day 7')
})

test('a retained sermon holds the seventh devotion after its formation week until replaced',()=>{
  assert.equal(sermonDevotionForDate({notes,source,targetDate:'2026-09-20'}).dayNumber,7)
})

test('daily spiritual fields are deterministically derived from the selected devotion',()=>{
  const devotion=sermonDevotionForDate({notes,source,targetDate:'2026-09-08'})
  const spiritual=applySermonDevotionToSpiritual({scripture:['old'],devotionFocus:'old'},devotion)
  assert.deepEqual(spiritual.scripture,['Mark 4:3'])
  assert.equal(spiritual.todayFocus,'Formation Day 3')
  assert.equal(spiritual.devotionFocus,'Focus 3')
  assert.equal(spiritual.obedienceAction,'Practice 3')
  assert.equal(spiritual.requiredOutput,'Evidence 3')
})

test('Today can address the matching generated devotion image without storing a new plan field',()=>{
  const id=sermonArtifactIdFromActive({notes,source})
  assert.equal(id,`2026-09-06-the-cultivation-of-the-soul-${hash.slice(0,12)}-v4`)
  assert.equal(sermonDevotionImageUrl({notes,source,targetDate:'2026-09-07'}),`/.netlify/functions/sermon-slides?id=${id}&asset=devotion&index=2`)
})
