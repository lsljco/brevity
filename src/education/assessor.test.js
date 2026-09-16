import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeAssessor} from './assessor.js'

test('adult guided assessor is limited to approved household tutors',()=>{assert.equal(normalizeAssessor('Terica'),'Terica');assert.equal(normalizeAssessor('Isaiah'),'')})
