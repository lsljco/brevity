import test from 'node:test'
import assert from 'node:assert/strict'
import {comparableFluencyTrend} from './progressTrend.js'

test('ordinary instructional probes are excluded from comparable progress groups',()=>{const groups=comparableFluencyTrend([{date:'2026-09-16',fluency:{probeId:'daily',wcpm:40,accuracy:90}},{date:'2026-10-14',fluency:{probeId:'pc1',comparisonGroup:'four-week-grade3',wcpm:45,accuracy:94}}]);assert.deepEqual(Object.keys(groups),['four-week-grade3']);assert.equal(groups['four-week-grade3'][0].wcpm,45)})
