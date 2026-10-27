import test from 'node:test'
import assert from 'node:assert/strict'
import {createMeetingFollowup} from './meetingFollowup.js'
test('every reply invites a follow-up without requiring a question or wake phrase',()=>{
 let time=1000;const followup=createMeetingFollowup({now:()=>time})
 assert.equal(followup.accepts('What about tomorrow?'),false)
 for(let turn=0;turn<6;turn++){followup.invite();time+=45000;assert.equal(followup.accepts('And the next item.'),true);assert.equal(followup.accepts('Room conversation'),false)}
})
test('expired and paused meeting windows require an explicit address',()=>{
 let time=1;const followup=createMeetingFollowup({now:()=>time})
 followup.invite();time+=90000;assert.equal(followup.accepts('Talking to family'),false)
 assert.equal(followup.accepts('Hey Brevity, help'),true)
 followup.invite();followup.reset();assert.equal(followup.accepts('Another conversation'),false)
})

test('addressed-only meetings ignore room conversation even after an invited reply',()=>{
 const followup=createMeetingFollowup({now:()=>1000,addressedOnly:true})
 followup.invite()
 assert.equal(followup.accepts('We could do that tomorrow.'),false)
 assert.equal(followup.accepts('Hey Brevity, what is next?'),true)
})
