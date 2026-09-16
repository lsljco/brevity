import test from 'node:test'
import assert from 'node:assert/strict'
import {standardsCoverage} from './standardsCoverage.js'

test('standards coverage is evidence-backed',()=>{assert.deepEqual(standardsCoverage({standardProgress:{'3.PAR.3.2':{status:'YELLOW',evidence:[{},{}],lastAssessedAt:'x'}}}),[{code:'3.PAR.3.2',status:'YELLOW',evidenceCount:2,lastAssessedAt:'x'}])})
