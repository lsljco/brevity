import test from 'node:test'
import assert from 'node:assert/strict'
import {prerequisiteBridge} from './prerequisiteBridge.js'

test('RED prerequisite repairs the smallest gap then reconnects to Grade 3 target',()=>{assert.equal(prerequisiteBridge({targetStandard:'3.PAR.3.2',prerequisiteSkill:'equal-groups',skillStatus:'RED'}).action,'teach-smallest-prerequisite-then-reconnect')})
