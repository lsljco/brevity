import test from 'node:test'
import assert from 'node:assert/strict'
import {ISAIAH_BASELINE} from './isaiahBaseline.js'

test('baseline remains pre-program evidence',()=>{assert.equal(ISAIAH_BASELINE.reading.oralReadingFluencyWcpm,34);assert.match(ISAIAH_BASELINE.notes.join(' '),/starts 2026-09-16/);assert.match(ISAIAH_BASELINE.notes.join(' '),/fixed ability/)})
