import test from 'node:test'
import assert from 'node:assert/strict'
import {fetchLatestPlaidTransactions, financeResponseError} from './financeRefresh.js'
import {retryRefresh, isTransientRefreshError} from '../household/retry.js'

test('all-institution failures preserve their status and safe cause so automatic retry actually runs', async () => {
  const prior=globalThis.fetch
  let requests=0
  globalThis.fetch=async()=>{
    requests++
    return requests===1
      ? {ok:false,status:502,json:async()=>({error:'Transaction sync failed for every connected institution.',errors:[{institution:'Fixture Bank',code:'INSTITUTION_DOWN',message:'The institution is temporarily unavailable.',access_token:'never show'}]})}
      : {ok:true,json:async()=>({connected:true,mode:'incremental',transactions:[],removed:[]})}
  }
  try {
    const result=await retryRefresh(()=>fetchLatestPlaidTransactions(),{baseDelayMs:0})
    assert.equal(requests,2)
    assert.equal(result.connected,true)
  } finally { globalThis.fetch=prior }
})

test('finance failure includes institution cause but excludes credentials and arbitrary provider metadata',()=>{
  const error=financeResponseError({error:'Transaction sync failed for every connected institution.',errors:[{institution:'Bank',code:'PLAID_CURSOR_READ_FAILED',message:'Checkpoint unavailable.',access_token:'secret',request_id:'private'}]},502)
  assert.equal(error.status,502)
  assert.ok(isTransientRefreshError(error))
  assert.match(error.message,/PLAID_CURSOR_READ_FAILED/)
  assert.doesNotMatch(error.message,/secret|private/)
  assert.equal(isTransientRefreshError(financeResponseError({error:'Sign in required.'},401)),false)
})
