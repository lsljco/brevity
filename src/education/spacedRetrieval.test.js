import test from 'node:test'
import assert from 'node:assert/strict'
import {applyCompletedTutorSession,emptyIsaiahEducationRecord} from './educationRecord.js'

test('GREEN schedules spaced retrieval rather than daily repair',()=>{let r=emptyIsaiahEducationRecord();const mk=(id,date,ids)=>({id,date,assessor:'Larry',responses:ids.map((x,i)=>({id:`${id}-${i}`,activityId:'math',skillId:'place-value',result:'independent',standardCodes:[]})),nextRetrievalDates:{'place-value':'2026-09-22'}});r=applyCompletedTutorSession(r,mk('s1','2026-09-16',[1]),{now:'2026-09-16T20:00:00Z'});r=applyCompletedTutorSession(r,mk('s2','2026-09-17',[1,2]),{now:'2026-09-17T20:00:00Z'});assert.equal(r.skillMastery['place-value'].status,'GREEN');assert.deepEqual(r.retrievalSchedule['place-value'],{dueDate:'2026-09-22',reason:'spaced-retrieval'})})
