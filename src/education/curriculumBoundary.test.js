import test from 'node:test'
import assert from 'node:assert/strict'
import {currentUnit} from './fultonCurriculum.js'

test('known Unit 2 boundaries are inclusive',()=>{assert.equal(currentUnit('2026-09-10','math')?.id,'math-u2');assert.equal(currentUnit('2026-10-22','math')?.id,'math-u2');assert.equal(currentUnit('2026-10-23','math'),null)})
