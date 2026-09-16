import test from 'node:test'
import assert from 'node:assert/strict'
import {DAY1_SESSION_DATE,day1Minutes} from './day1Contract.js'

test('Day 1 starts September 16 and remains a 45-minute session',()=>{assert.equal(DAY1_SESSION_DATE,'2026-09-16');assert.equal(day1Minutes(),45)})
