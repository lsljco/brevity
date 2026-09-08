import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const require = createRequire(import.meta.url)
const {
  SYNC_MUTATION_CODE,
  buildPendingDelta,
  consolidateTransactionDelta,
  lastSuccessfulTransactionUpdate,
  mapPlaidTransaction,
  responseBody,
  syncAndStageItem,
  syncItemTransactions,
  transactionRefreshCompleted,
} = require('../../netlify/functions/plaid-transactions.js')
const {
  ackTransactionSyncBatch,
  verifyTransactionSyncReceipts,
} = require('../../netlify/functions/storage.js')

test('transaction refresh completion requires a successful Item update at or after the request', () => {
  const response={data:{item:{status:{transactions:{last_successful_update:'2026-09-08T23:00:05.000Z'}}}}}
  assert.equal(lastSuccessfulTransactionUpdate(response),'2026-09-08T23:00:05.000Z')
  assert.equal(transactionRefreshCompleted(lastSuccessfulTransactionUpdate(response),'2026-09-08T23:00:00.000Z'),true)
  assert.equal(transactionRefreshCompleted('2026-09-08T22:59:59.000Z','2026-09-08T23:00:00.000Z'),false)
  assert.equal(transactionRefreshCompleted('','2026-09-08T23:00:00.000Z'),false)
})

test('Plaid transaction sync consumes every page and returns one complete cursor advancement', async () => {
  const calls = []
  const pages = [
    { data:{ added:[{ transaction_id:'added-1' }], modified:[], removed:[], has_more:true, next_cursor:'cursor-1' } },
    { data:{ added:[], modified:[{ transaction_id:'modified-1' }], removed:[{ transaction_id:'removed-1' }], has_more:false, next_cursor:'cursor-2' } },
  ]
  const result = await syncItemTransactions({
    client:{ transactionsSync:async request => { calls.push(request); return pages.shift() } },
    accessToken:'access-token',
  })

  assert.equal(result.nextCursor, 'cursor-2')
  assert.equal(result.pages, 2)
  assert.deepEqual(result.added.map(item => item.transaction_id), ['added-1'])
  assert.deepEqual(result.modified.map(item => item.transaction_id), ['modified-1'])
  assert.deepEqual(result.removed.map(item => item.transaction_id), ['removed-1'])
  assert.equal(calls[0].cursor, undefined)
  assert.equal(calls[0].count, 500)
  assert.equal(calls[1].cursor, 'cursor-1')
})

test('a pagination mutation discards partial pages and restarts from the durable initial cursor', async () => {
  const calls = []
  const responses = [
    { data:{ added:[{ transaction_id:'discard-me' }], modified:[], removed:[], has_more:true, next_cursor:'unstable-page' } },
    Object.assign(new Error('mutation'), { response:{ data:{ error_code:SYNC_MUTATION_CODE } } }),
    { data:{ added:[{ transaction_id:'keep-me' }], modified:[], removed:[], has_more:false, next_cursor:'stable-final' } },
  ]
  const result = await syncItemTransactions({
    client:{ transactionsSync:async request => {
      calls.push(request.cursor || '')
      const next = responses.shift()
      if (next instanceof Error) throw next
      return next
    } },
    accessToken:'access-token',
    initialCursor:'durable-start',
  })

  assert.deepEqual(calls, ['durable-start', 'unstable-page', 'durable-start'])
  assert.deepEqual(result.added.map(item => item.transaction_id), ['keep-me'])
  assert.equal(result.nextCursor, 'stable-final')
  assert.equal(result.restarts, 1)
})

test('pagination mutation retries are bounded', async () => {
  let calls = 0
  await assert.rejects(
    syncItemTransactions({
      client:{ transactionsSync:async () => {
        calls += 1
        throw Object.assign(new Error('mutation'), { response:{ data:{ error_code:SYNC_MUTATION_CODE } } })
      } },
      accessToken:'access-token',
      maxMutationRestarts:2,
    }),
    error => error.response.data.error_code === SYNC_MUTATION_CODE,
  )
  assert.equal(calls, 3)
})

test('a delta is staged only after all pages complete and the acknowledged cursor does not advance', async () => {
  const order = []
  const pages = [
    { data:{ added:[{ transaction_id:'one' }], modified:[], removed:[], has_more:true, next_cursor:'page-1' } },
    { data:{ added:[{ transaction_id:'two' }], modified:[], removed:[], has_more:false, next_cursor:'page-2' } },
  ]
  const result = await syncAndStageItem({
    client:{ transactionsSync:async () => { order.push('page'); return pages.shift() } },
    accessToken:'access-token',
    itemId:'item-1',
    institution:'Bank',
    readState:async () => ({ state:{ cursor:'durable-start' }, etag:'etag-1', exists:true }),
    writeState:async (_identity, state, _event, expected) => {
      order.push('stage')
      assert.equal(state.cursor, 'durable-start')
      assert.equal(state.pendingDelta.nextCursor, 'page-2')
      assert.equal(expected.etag, 'etag-1')
    },
    now:() => '2026-09-07T12:00:00.000Z',
  })

  assert.deepEqual(order, ['page', 'page', 'stage'])
  assert.equal(result.pendingDelta.createdAt, '2026-09-07T12:00:00.000Z')
  assert.equal(result.pendingDelta.nextCursor, 'page-2')
  assert.deepEqual(result.pendingDelta.transactions.map(transaction => transaction.id), ['one', 'two'])
  assert.deepEqual(result.receipt, { cursorIdentity:'item-1', batchId:result.pendingDelta.batchId })
})

test('a failed page never stages a cursor or delta', async () => {
  let stages = 0
  const responses = [
    { data:{ added:[{ transaction_id:'partial' }], modified:[], removed:[], has_more:true, next_cursor:'partial-page' } },
    Object.assign(new Error('bank unavailable'), { response:{ data:{ error_code:'INSTITUTION_DOWN' } } }),
  ]

  await assert.rejects(syncAndStageItem({
    client:{ transactionsSync:async () => {
      const next = responses.shift()
      if (next instanceof Error) throw next
      return next
    } },
    accessToken:'access-token',
    itemId:'item-1',
    readState:async () => ({ state:{ cursor:'durable-start' }, etag:'etag-1', exists:true }),
    writeState:async () => { stages += 1 },
  }), /bank unavailable/)

  assert.equal(stages, 0)
})

test('an unacknowledged batch is replayed verbatim without another Plaid request', async () => {
  const pendingDelta = {
    batchId:'a'.repeat(64),
    fromCursor:'cursor-1',
    nextCursor:'cursor-2',
    transactions:[{ id:'tx-1' }],
    removed:['tx-old'],
    delta:{ added:1, modified:0, removed:1 },
    createdAt:'2026-09-07T12:00:00.000Z',
  }
  let plaidCalls = 0
  let writes = 0
  const result = await syncAndStageItem({
    client:{ transactionsSync:async () => { plaidCalls += 1 } },
    accessToken:'access-token',
    itemId:'item-1',
    readState:async () => ({ state:{ cursor:'cursor-1', pendingDelta }, etag:'etag-1', exists:true }),
    writeState:async () => { writes += 1 },
  })
  assert.equal(result.pendingDelta, pendingDelta)
  assert.equal(result.replayed, true)
  assert.deepEqual(result.receipt, { cursorIdentity:'item-1', batchId:'a'.repeat(64) })
  assert.equal(plaidCalls, 0)
  assert.equal(writes, 0)
})

test('staged transaction deltas have a hard record-count bound', () => {
  assert.throws(() => buildPendingDelta({
    cursorIdentity:'item-1',
    fromCursor:'',
    result:{
      added:Array.from({ length:10_001 }, (_, index) => ({ transaction_id:`tx-${index}` })),
      modified:[],
      removed:[],
      nextCursor:'cursor-1',
    },
    institution:'Bank',
    itemId:'item-1',
    createdAt:'2026-09-07T12:00:00.000Z',
  }), error => error.code === 'PLAID_SYNC_DELTA_LIMIT')
})

test('receipt verification returns only the exact staged server delta', async () => {
  const receipt = { cursorIdentity:'item-1', batchId:'b'.repeat(64) }
  const pendingDelta = { batchId:receipt.batchId, transactions:[{ id:'tx-1' }], removed:['tx-old'], nextCursor:'next' }
  const verified = await verifyTransactionSyncReceipts([receipt], {}, {
    readState:async identity => {
      assert.equal(identity, 'item-1')
      return { state:{ pendingDelta }, etag:'etag-1', exists:true }
    },
  })
  assert.equal(verified.length, 1)
  assert.equal(verified[0].pendingDelta, pendingDelta)

  await assert.rejects(
    verifyTransactionSyncReceipts([{ ...receipt, batchId:'c'.repeat(64) }], {}, {
      readState:async () => ({ state:{ pendingDelta }, etag:'etag-1', exists:true }),
    }),
    error => error.code === 'PLAID_RECEIPT_MISMATCH',
  )
})

test('acknowledgement exact-matches the batch and promotes its cursor with CAS', async () => {
  const receipt = { cursorIdentity:'item-1', batchId:'d'.repeat(64) }
  let state = {
    cursor:'acknowledged-before',
    pendingDelta:{ batchId:receipt.batchId, nextCursor:'acknowledged-after', transactions:[], removed:[] },
  }
  let etag = 'etag-1'
  const dependencies = {
    readState:async () => ({ state, etag, exists:true }),
    writeState:async (_identity, next, _event, expected) => {
      assert.equal(expected.etag, etag)
      state = next
      etag = 'etag-2'
    },
    now:() => '2026-09-07T13:00:00.000Z',
  }
  const first = await ackTransactionSyncBatch(receipt, {}, dependencies)
  assert.equal(first.acknowledged, true)
  assert.equal(first.alreadyAcknowledged, false)
  assert.equal(state.cursor, 'acknowledged-after')
  assert.equal(state.pendingDelta, null)
  assert.equal(state.lastAcknowledgedBatchId, receipt.batchId)
  assert.equal(state.acknowledgedAt, '2026-09-07T13:00:00.000Z')

  const second = await ackTransactionSyncBatch(receipt, {}, dependencies)
  assert.equal(second.alreadyAcknowledged, true)
})

test('after durable acknowledgement the next sync starts at the promoted cursor and exposes the next delta', async () => {
  let state = { cursor:'cursor-before', pendingDelta:null }
  let etag = 'etag-1'
  const readState = async () => ({ state:structuredClone(state), etag, exists:true })
  const writeState = async (_identity, next, _event, expected) => {
    assert.equal(expected.etag, etag)
    state = structuredClone(next)
    etag = etag === 'etag-1' ? 'etag-2' : etag === 'etag-2' ? 'etag-3' : 'etag-4'
  }
  const cursors = []
  const plaidResponses = [
    { data:{ added:[{ transaction_id:'first', account_id:'account', amount:10, date:'2026-09-06', pending:false }], modified:[], removed:[], has_more:false, next_cursor:'cursor-after-first' } },
    { data:{ added:[{ transaction_id:'second', account_id:'account', amount:20, date:'2026-09-07', pending:false }], modified:[], removed:[], has_more:false, next_cursor:'cursor-after-second' } },
  ]
  const client = { transactionsSync:async request => {
    cursors.push(request.cursor)
    return plaidResponses.shift()
  } }

  const first = await syncAndStageItem({ client, accessToken:'access', itemId:'item-1', readState, writeState })
  assert.equal(state.cursor,'cursor-before')
  assert.equal(first.pendingDelta.transactions[0].id,'first')
  await ackTransactionSyncBatch(first.receipt, {}, { readState, writeState })
  assert.equal(state.cursor,'cursor-after-first')
  assert.equal(state.pendingDelta,null)

  const second = await syncAndStageItem({ client, accessToken:'access', itemId:'item-1', readState, writeState })
  assert.deepEqual(cursors,['cursor-before','cursor-after-first'])
  assert.equal(second.pendingDelta.transactions[0].id,'second')
  assert.equal(state.cursor,'cursor-after-first')
  assert.equal(state.pendingDelta.nextCursor,'cursor-after-second')
})

test('delta consolidation makes modifications win and removals authoritative', () => {
  const result = consolidateTransactionDelta(
    [{ transaction_id:'changed', amount:10 }, { transaction_id:'removed', amount:20 }],
    [{ transaction_id:'changed', amount:11 }],
    [{ transaction_id:'removed' }],
  )
  assert.deepEqual(result.changed, [{ transaction:{ transaction_id:'changed', amount:11 }, change:'modified' }])
  assert.deepEqual(result.removed, ['removed'])
  assert.deepEqual(result.counts, { added:2, modified:1, removed:1 })
})

test('mapped deltas identify their Plaid item and institution', () => {
  const transaction = mapPlaidTransaction({
    transaction_id:'tx-1',
    account_id:'account-1',
    name:'Statement name',
    merchant_name:'Merchant',
    original_description:'Original',
    amount:42,
    date:'2026-09-07',
    pending:false,
    personal_finance_category:{ primary:'GENERAL_MERCHANDISE' },
  }, { itemId:'item-1', institution:'Bank' })

  assert.equal(transaction.id, 'tx-1')
  assert.equal(transaction.itemId, 'item-1')
  assert.equal(transaction.institution, 'Bank')
  assert.deepEqual(Object.keys(transaction).sort(), ['accountId','amount','category','date','id','institution','itemId','name','originalStatement','pending','type'].sort())
})

test('incremental responses never imply that an empty delta replaces cached history', () => {
  assert.deepEqual(responseBody({ connected:false }), {
    connected:false,
    mode:'incremental',
    transactions:[],
    removed:[],
    count:0,
    delta:{ added:0, modified:0, removed:0 },
    errors:[],
    refresh:{ requested:false, accepted:0, errors:[] },
    syncedAt:null,
    successfulInstitutions:[],
    successfulItems:[],
    sourceReceipts:[],
  })
})

test('the handler uses transactionsSync and stages a durable outbox before exposing its receipt', () => {
  const source = readFileSync(new URL('../../netlify/functions/plaid-transactions.js', import.meta.url), 'utf8')
  assert.match(source, /plaidClient\.transactionsSync|client\.transactionsSync/)
  assert.doesNotMatch(source, /transactionsGet/)
  assert.match(source, /const result = await syncItemTransactions[\s\S]*await writeState\(cursorIdentity, cursorState/)
  assert.match(source, /sourceReceipts/)
  assert.match(source, /successfulItems/)
  assert.match(source, /connected:false/)
})
