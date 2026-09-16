import test from 'node:test'
import assert from 'node:assert/strict'
import {masteryCounts} from './masteryCounts.js'

test('mastery dashboard counts only recorded skills',()=>{assert.deepEqual(masteryCounts({skillMastery:{a:{status:'RED'},b:{status:'GREEN'},c:{status:'GREEN'}}}),{RED:1,YELLOW:0,GREEN:2,BLUE:0})})
