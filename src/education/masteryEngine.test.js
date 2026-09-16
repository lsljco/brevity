import test from 'node:test'
import assert from 'node:assert/strict'
import { MASTERY, calculateFluency, deriveMastery, nextRetrievalDate, resolveCurrentUnit } from './masteryEngine.js'

test('fluency calculates WCPM and accuracy',()=>assert.deepEqual(calculateFluency(48,7),{wcpm:41,accuracy:85.4}))
test('first strong encounter remains yellow',()=>assert.equal(deriveMastery({independentCorrect:5,total:5,encounters:1}),MASTERY.YELLOW))
test('second varied strong encounter can become green',()=>assert.equal(deriveMastery({previous:'YELLOW',independentCorrect:5,total:5,encounters:2}),MASTERY.GREEN))
test('stretch success after repeated mastery becomes blue',()=>assert.equal(deriveMastery({previous:'GREEN',independentCorrect:4,total:4,encounters:3,stretch:true}),MASTERY.BLUE))
test('green retrieval is spaced',()=>assert.equal(nextRetrievalDate('GREEN','2026-09-16',2),'2026-09-23'))
test('current Fulton unit resolves by pacing dates',()=>assert.equal(resolveCurrentUnit([{id:'u2',startDate:'2026-09-10',endDate:'2026-10-22'}],'2026-09-16')?.id,'u2'))
