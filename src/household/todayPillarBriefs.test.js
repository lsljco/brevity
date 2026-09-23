import assert from 'node:assert/strict'
import test from 'node:test'
import { educationBrief, financeBrief, ministryBrief } from './todayPillarBriefs.js'

test('last three Today pillars surface their actual recorded content',()=>{
  assert.deepEqual(educationBrief({thinkTankTopic:'Brevity Review',thinkTankDeliverable:'Document the four household priorities'}),{
    title:'Brevity Review',detail:'Document the four household priorities',meta:[],
  })
  assert.deepEqual(financeBrief({bills:[{title:'Mortgage'},{title:'AT&T'},{title:'Electricity'},{title:'Water'}],purchases:[]}),{
    title:'4 financial items require review',detail:'Mortgage · AT&T · Electricity',meta:['4 bills'],
  })
  assert.deepEqual(ministryBrief({prayerNeeds:['Daily Prayer']}),{
    title:'Daily Prayer',detail:'Prayer need recorded for today.',meta:['1 prayer need'],prayerNeeds:['Daily Prayer'],
  })
})

test('Pillar 7 counts and retains every recorded prayer need',()=>{
  const prayers=Array.from({length:14},(_,index)=>`Prayer request ${index+1}`)
  const brief=ministryBrief({contentFocus:'Serve faithfully',prayerNeeds:prayers})
  assert.equal(brief.title,'Serve faithfully')
  assert.deepEqual(brief.prayerNeeds,prayers)
  assert.deepEqual(brief.meta,['14 prayer needs'])
  assert.match(brief.detail,/Prayer request 1/)
})

test('last three Today pillars disclose missing detail instead of generic filler',()=>{
  assert.match(educationBrief({}).detail,/No education topic/)
  assert.match(financeBrief({}).detail,/No financial output/)
  assert.match(ministryBrief({}).detail,/No ministry focus/)
})
