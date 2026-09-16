import test from 'node:test'
import assert from 'node:assert/strict'
import {EDUCATION_ACTIVITY_RESULTS} from './activityResults.js'

test('adult guided controls preserve the four required evidence states',()=>{assert.deepEqual(EDUCATION_ACTIVITY_RESULTS.map(x=>x.label),['Correct Independently','Correct With Prompt','Incorrect','Could Not Attempt'])})
