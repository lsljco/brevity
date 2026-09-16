import test from 'node:test'
import assert from 'node:assert/strict'
import {nextSessionDirectives} from './nextSession.js'

test('next session repairs RED, confirms YELLOW, and retrieves GREEN only when due',()=>{const record={skillMastery:{decoding:{status:'RED'},groups:{status:'YELLOW'},place:{status:'GREEN'},stretch:{status:'BLUE'}},retrievalSchedule:{place:{dueDate:'2026-09-19'},stretch:{dueDate:'2026-09-17'}}};assert.deepEqual(nextSessionDirectives(record,{date:'2026-09-17'}),{date:'2026-09-17',repair:['decoding'],confirm:['groups'],due:['stretch'],stretch:[]})})
