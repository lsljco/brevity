import test from 'node:test'
import assert from 'node:assert/strict'
import {evidenceResultLabel} from './evidenceLabels.js'

test('evidence labels are adult-readable',()=>{assert.equal(evidenceResultLabel('independent'),'Correct Independently');assert.equal(evidenceResultLabel('unable'),'Could Not Attempt')})
