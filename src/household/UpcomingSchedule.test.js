import test from 'node:test'
import assert from 'node:assert/strict'
import {scheduleDates} from './UpcomingScheduleDates.js'

test('upcoming selector includes today and seven following days across a month boundary',()=>{
  assert.deepEqual(scheduleDates('2026-09-29'),['2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06'])
})
