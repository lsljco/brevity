import test from 'node:test'
import assert from 'node:assert/strict'
import {fourWeekCheckDue} from './progressCheck.js'

test('four-week comparable check is not due during initial 27 days',()=>{assert.equal(fourWeekCheckDue({date:'2026-10-13'}),false);assert.equal(fourWeekCheckDue({date:'2026-10-14'}),true)})
