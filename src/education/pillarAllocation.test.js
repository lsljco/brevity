import test from 'node:test'
import assert from 'node:assert/strict'
import {householdEducationAllocation} from './pillarAllocation.js'

test('one completed tutor session produces one Education allocation per participant without duplicate member rows',()=>{const rows=householdEducationAllocation({id:'s1',assessor:'Isaiah',completedAt:'2026-09-16T20:00:00Z'});assert.deepEqual(rows,[{member:'Isaiah',pillar:'education',minutes:45,source:'tutor-session:s1'}])})
