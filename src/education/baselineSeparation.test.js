import test from 'node:test'
import assert from 'node:assert/strict'
import {applyCompletedTutorSession,emptyIsaiahEducationRecord} from './educationRecord.js'

test('August benchmark is not silently inserted as a completed September tutor session',()=>{const r=emptyIsaiahEducationRecord();assert.equal(r.sessions.length,0);const after=applyCompletedTutorSession(r,{id:'day1',date:'2026-09-16',assessor:'Larry',responses:[],fluency:{probeId:'instructional-day1',wordsAttempted:40,errors:4}},{now:'2026-09-16T20:00:00Z'});assert.equal(after.sessions.length,1);assert.equal(after.sessions[0].fluency.probeId,'instructional-day1');assert.equal(after.sessions[0].fluency.wcpm,36)})
