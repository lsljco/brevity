import test from 'node:test'
import assert from 'node:assert/strict'
import { MASTERY, calculateFluency, deriveMastery, nextRetrievalDate, resolveCurrentUnit } from '../education/masteryEngine.js'
test('Education fluency and mastery rules',()=>{assert.deepEqual(calculateFluency(48,7),{wcpm:41,accuracy:85.4});assert.equal(deriveMastery({independentCorrect:5,total:5,encounters:1}),MASTERY.YELLOW);assert.equal(deriveMastery({independentCorrect:5,total:5,encounters:2}),MASTERY.GREEN);assert.equal(nextRetrievalDate('GREEN','2026-09-16',2),'2026-09-23');assert.equal(resolveCurrentUnit([{id:'u2',startDate:'2026-09-10',endDate:'2026-10-22'}],'2026-09-16')?.id,'u2')})
