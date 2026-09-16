import test from 'node:test'
import assert from 'node:assert/strict'
import {sessionCompletionSummary} from './sessionSummary.js'

test('completion summary is derived from persisted evidence state',()=>{const x=sessionCompletionSummary({sessions:[{id:'s1',date:'2026-09-16',assessor:'Larry',completedAt:'x',responses:[{skillId:'groups'}]}],skillMastery:{groups:{status:'YELLOW'}}});assert.equal(x.skillStatuses.groups,'YELLOW')})
