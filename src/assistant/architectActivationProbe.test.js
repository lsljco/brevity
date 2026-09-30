import test from 'node:test'
import assert from 'node:assert/strict'
import {summarizeProbeChecks} from './architectActivationProbe.js'

test('summarizeProbeChecks returns correct counts for all-true',()=>{
  const result = summarizeProbeChecks([true,true,true])
  assert.deepEqual(result,{passed:3,total:3,allPassed:true})
})

test('summarizeProbeChecks returns correct for mixed values',()=>{
  const result = summarizeProbeChecks([true,false,true,false])
  assert.deepEqual(result,{passed:2,total:4,allPassed:false})
})

test('summarizeProbeChecks returns correct for all-false',()=>{
  const result = summarizeProbeChecks([false,false])
  assert.deepEqual(result,{passed:0,total:2,allPassed:false})
})

test('summarizeProbeChecks returns correct for empty array (allPassed false)',()=>{
  const result = summarizeProbeChecks([])
  assert.deepEqual(result,{passed:0,total:0,allPassed:false})
})

test('summarizeProbeChecks rejects non-array inputs',()=>{
  const badInputs = [null,undefined,42,'string',{foo:true}]
  for(const input of badInputs){
    assert.throws(()=>summarizeProbeChecks(input),TypeError)
  }
})

test('summarizeProbeChecks rejects arrays with non-boolean entries',()=>{
  const badArrays = [[true,1],[false,'false'],[0,false],[true,null]]
  for(const arr of badArrays){
    assert.throws(()=>summarizeProbeChecks(arr),TypeError)
  }
})
