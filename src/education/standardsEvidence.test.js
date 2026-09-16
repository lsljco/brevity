import test from 'node:test'
import assert from 'node:assert/strict'
import {standardsEvidenceForSession} from './standardsEvidence.js'

test('one response can support multiple explicitly linked standards without affecting unlinked standards',()=>{const x=standardsEvidenceForSession({responses:[{id:'r1',skillId:'groups',result:'independent',standardCodes:['3.PAR.3.2','3.PAR.3.6']}]});assert.deepEqual(Object.keys(x),['3.PAR.3.2','3.PAR.3.6'])})
