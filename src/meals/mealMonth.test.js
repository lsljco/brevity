import assert from 'node:assert/strict'
import test from 'node:test'
import { mealMonthRange } from './mealMonth.js'

test('month ranges include every calendar day, including leap day', () => {
  assert.deepEqual(mealMonthRange('2026-09'), { startDate:'2026-09-01', count:30 })
  assert.deepEqual(mealMonthRange('2028-02'), { startDate:'2028-02-01', count:29 })
  assert.throws(() => mealMonthRange('2026-13'))
})
