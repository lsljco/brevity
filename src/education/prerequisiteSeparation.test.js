import test from 'node:test'
import assert from 'node:assert/strict'
import {applyCompletedTutorSession,emptyIsaiahEducationRecord} from './educationRecord.js'

test('prerequisite evidence does not manufacture Grade 3 standards progress',()=>{const r=applyCompletedTutorSession(emptyIsaiahEducationRecord(),{id:'s1',date:'2026-09-16',assessor:'Larry',responses:[{id:'r1',activityId:'read-1',skillId:'closed-syllable-decoding',result:'independent',standardCodes:[]}]},{now:'2026-09-16T20:00:00Z'});assert.equal(r.skillMastery['closed-syllable-decoding'].status,'YELLOW');assert.deepEqual(r.standardProgress,{})})
