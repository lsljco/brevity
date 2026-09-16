import test from 'node:test'
import assert from 'node:assert/strict'
import {validateCurriculumProvenance} from './curriculumProvenance.js'

test('unverified curriculum metadata cannot claim official provenance',()=>{assert.equal(validateCurriculumProvenance({subject:'math',title:'Guess',start:'x',end:'y'}),false)})
