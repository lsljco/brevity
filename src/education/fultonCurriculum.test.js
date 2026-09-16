import test from 'node:test'
import assert from 'node:assert/strict'
import {currentUnit,curriculumAlignment} from './fultonCurriculum.js'

test('September 16 resolves Fulton Grade 3 multiplication pacing',()=>{const unit=currentUnit('2026-09-16','math');assert.equal(unit?.title,'Exploring Multiplication');assert.ok(unit.standardCodes.includes('3.PAR.3.2'))})
test('current resolver does not pretend a unit applies outside its effective dates',()=>{assert.equal(currentUnit('2026-11-01','math'),null)})
test('alignment retains school-year provenance',()=>{const a=curriculumAlignment('2026-09-16','science','S3L1');assert.equal(a.schoolYear,'2026-27');assert.equal(a.onPace,true);assert.match(a.provenance,/Fulton County Schools/)})
