import test from 'node:test'
import assert from 'node:assert/strict'
import {activityExplainability} from './explainability.js'

test('why and standards remain separate explainability surfaces',()=>{const x=activityExplainability({activity:{objective:'Represent equal groups',prerequisite:'skip counting',selectionReason:'Current Unit 2 target',standardCode:'3.PAR.3.2'},curriculum:{schoolYear:'2026-27',onPace:true,provenance:'Fulton County Schools',unit:{subject:'math',title:'Exploring Multiplication',start:'2026-09-10',end:'2026-10-22'}},mastery:{status:'YELLOW',evidence:[{}]}});assert.equal(x.why.prerequisite,'skip counting');assert.equal(x.standards.standardCode,'3.PAR.3.2');assert.equal(x.standards.onPace,true)})
