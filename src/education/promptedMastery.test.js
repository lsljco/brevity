import test from 'node:test'
import assert from 'node:assert/strict'
import {applyCompletedTutorSession,emptyIsaiahEducationRecord} from './educationRecord.js'

test('prompted work cannot independently promote mastery to GREEN',()=>{let r=emptyIsaiahEducationRecord();for(const [i,date] of ['2026-09-16','2026-09-17','2026-09-18'].entries())r=applyCompletedTutorSession(r,{id:`s${i}`,date,assessor:'Larry',responses:[{id:`r${i}`,activityId:'phonics',skillId:'decoding',result:'prompted',standardCodes:[]}]},{now:`${date}T20:00:00Z`});assert.equal(r.skillMastery.decoding.status,'YELLOW')})
