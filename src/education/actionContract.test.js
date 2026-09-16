import test from 'node:test'
import assert from 'node:assert/strict'
import {EDUCATION_ACTION_TYPE,EDUCATION_RECORD_RESOURCE} from './actionContract.js'

test('Education persistence has a dedicated resource instead of overloading planning',()=>{assert.match(EDUCATION_ACTION_TYPE,/^education\./);assert.equal(EDUCATION_RECORD_RESOURCE,'shared:brevity_education_isaiah_v1')})
