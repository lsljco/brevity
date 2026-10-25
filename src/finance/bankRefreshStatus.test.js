import test from 'node:test'
import assert from 'node:assert/strict'
import { bankRetryTime, readableBankMessage, normalTransactionSyncNotice } from './bankRefreshStatus.js'

test('balance cooldown extracts only a valid balance retry time', () => {
  assert.equal(bankRetryTime('A paid balance check was already requested. Try after 2026-10-25T22:18:28.098Z. Normal sync remains available.'), '2026-10-25T22:18:28.098Z')
  assert.equal(bankRetryTime('A paid transaction refresh was already requested. Try after 2026-10-25T22:18:28.098Z.'), '')
  assert.equal(bankRetryTime('Bank unavailable'), '')
})

test('bank timestamps display Eastern time including seasonal offset', () => {
  assert.match(readableBankMessage('Try after 2026-10-25T22:18:28.098Z.'), /Oct 25, 2026.*6:18 PM EDT/)
  assert.match(readableBankMessage('2026-12-25T22:18:28Z'), /5:18 PM EST/)
  assert.equal(readableBankMessage('Normal sync remains available.'), 'Normal sync remains available.')
})

test('normal sync distinguishes partial, failed, processing and complete snapshots', () => {
  for (const result of [undefined, {error:'Offline'}, {connected:false}]) assert.match(normalTransactionSyncNotice(result), /did not complete/)
  for (const result of [{errors:[{}]}, {refresh:{errors:[{}]}}]) assert.match(normalTransactionSyncNotice(result), /Forecast uses incomplete bank data/)
  assert.match(normalTransactionSyncNotice({refresh:{stillProcessing:true}}), /still processing/)
  assert.match(normalTransactionSyncNotice({connected:true, transactions:[]}), /last live balance-check time is unchanged/)
})
