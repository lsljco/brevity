import test from 'node:test'
import assert from 'node:assert/strict'
import {masteryScorecard} from './masteryScorecard.js'

test('scorecard exposes latest fluency and retrieval decision',()=>{const s=masteryScorecard({sessions:[{date:'2026-09-16',fluency:{wcpm:41,accuracy:91.1},responses:[{skillId:'groups',result:'independent'}]}],skillMastery:{groups:{status:'YELLOW'}},retrievalSchedule:{groups:{dueDate:'2026-09-17'}}});assert.equal(s.wcpm,41);assert.equal(s.rows[0].status,'YELLOW');assert.equal(s.rows[0].retrieve,'2026-09-17')})
