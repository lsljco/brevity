import test from 'node:test'
import assert from 'node:assert/strict'
import {applyCompletedTutorSession,emptyIsaiahEducationRecord,fluencyMetrics,masteryFromEvidence} from './educationRecord.js'

const response=(id,skillId,result,standardCodes=[])=>({id,activityId:`a-${id}`,skillId,result,standardCodes})
const session=(id,date,responses,extra={})=>({id,date,assessor:'Larry',responses,...extra})

test('fluency preserves probe identity and calculates WCPM/accuracy',()=>{assert.deepEqual(fluencyMetrics({probeId:'p1',wordsAttempted:48,errors:7}),{probeId:'p1',wordsAttempted:48,errors:7,wcpm:41,accuracy:85.4})})

test('GREEN requires independent evidence across more than one encounter',()=>{
 assert.equal(masteryFromEvidence([{sessionId:'s1',result:'independent'},{sessionId:'s1',result:'independent'},{sessionId:'s1',result:'independent'}]),'YELLOW')
 assert.equal(masteryFromEvidence([{sessionId:'s1',result:'independent'},{sessionId:'s2',result:'independent'},{sessionId:'s2',result:'independent'}]),'GREEN')
})

test('BLUE requires transfer/stretch after repeated independent encounters',()=>{assert.equal(masteryFromEvidence([{sessionId:'s1',result:'independent'},{sessionId:'s2',result:'independent',stretch:true},{sessionId:'s2',result:'independent'}]),'BLUE')})

test('session completion keeps skill and Grade 3 standard progress separate',()=>{
 let r=emptyIsaiahEducationRecord()
 r=applyCompletedTutorSession(r,session('s1','2026-09-16',[response('r1','equal-groups','independent',['3.PAR.3.2'])]),{now:'2026-09-16T20:00:00Z'})
 assert.equal(r.skillMastery['equal-groups'].status,'YELLOW');assert.equal(r.standardProgress['3.PAR.3.2'].status,'YELLOW')
 r=applyCompletedTutorSession(r,session('s2','2026-09-17',[response('r2','equal-groups','independent',['3.PAR.3.2']),response('r3','equal-groups','independent',['3.PAR.3.2'])]),{now:'2026-09-17T20:00:00Z'})
 assert.equal(r.skillMastery['equal-groups'].status,'GREEN');assert.equal(r.standardProgress['3.PAR.3.2'].status,'GREEN')
})

test('completed session ids are idempotency boundaries',()=>{const r=applyCompletedTutorSession(emptyIsaiahEducationRecord(),session('s1','2026-09-16',[response('r1','decoding','prompted')]),{now:'2026-09-16T20:00:00Z'});assert.throws(()=>applyCompletedTutorSession(r,session('s1','2026-09-16',[response('r2','decoding','independent')]),{now:'2026-09-16T20:01:00Z'}),/already recorded/)})
