const crypto = require('crypto')
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid')
const { getTokens, getTransactionSyncState, setTransactionSyncState } = require('./storage')
const { readSession } = require('./household-auth')

const SYNC_PAGE_SIZE = 500
const MAX_SYNC_PAGES = 100
const MAX_MUTATION_RESTARTS = 2
const SYNC_MUTATION_CODE = 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION'
const MAX_PENDING_TRANSACTIONS = 10_000
const MAX_PENDING_REMOVALS = 10_000
const MAX_PENDING_BYTES = 4_000_000

const plaidClient = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: { headers: {
    'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
    'PLAID-SECRET': process.env.PLAID_SECRET,
  }},
}))

function plaidErrorCode(error) {
  return error?.response?.data?.error_code || error?.code || ''
}

function itemCursorIdentity(itemId, accessToken) {
  if (itemId) return itemId
  return `legacy-${crypto.createHash('sha256').update(String(accessToken || '')).digest('hex')}`
}

function mapPlaidTransaction(transaction, { institution = '', itemId = '' } = {}) {
  return {
    id:transaction.transaction_id,
    accountId:transaction.account_id,
    name:transaction.merchant_name || transaction.name,
    originalStatement:transaction.original_description || transaction.name,
    amount:transaction.amount,
    date:transaction.date || transaction.authorized_date,
    category:transaction.personal_finance_category?.primary || transaction.category?.[0] || 'Other',
    type:transaction.amount > 0 ? 'expense' : 'income',
    institution,
    itemId,
    pending:Boolean(transaction.pending),
  }
}

function consolidateTransactionDelta(added = [], modified = [], removed = []) {
  const removedIds = new Set(removed.map(transaction => transaction?.transaction_id).filter(Boolean))
  const changed = new Map()
  added.forEach(transaction => {
    if (transaction?.transaction_id && !removedIds.has(transaction.transaction_id)) changed.set(transaction.transaction_id, { transaction, change:'added' })
  })
  modified.forEach(transaction => {
    if (transaction?.transaction_id && !removedIds.has(transaction.transaction_id)) changed.set(transaction.transaction_id, { transaction, change:'modified' })
  })
  return {
    changed:[...changed.values()],
    removed:[...removedIds],
    counts:{
      added:new Set(added.map(transaction => transaction?.transaction_id).filter(Boolean)).size,
      modified:new Set(modified.map(transaction => transaction?.transaction_id).filter(Boolean)).size,
      removed:removedIds.size,
    },
  }
}

async function syncItemTransactions({
  client,
  accessToken,
  initialCursor = '',
  maxPages = MAX_SYNC_PAGES,
  maxMutationRestarts = MAX_MUTATION_RESTARTS,
}) {
  let restarts = 0

  while (true) {
    let cursor = initialCursor || ''
    let hasMore = true
    let pages = 0
    const added = []
    const modified = []
    const removed = []

    try {
      while (hasMore) {
        if (pages >= maxPages) {
          const error = new Error('Plaid transaction sync exceeded the safe pagination limit.')
          error.code = 'PLAID_SYNC_PAGE_LIMIT'
          throw error
        }

        const requestCursor = cursor
        const response = await client.transactionsSync({
          access_token:accessToken,
          ...(cursor ? { cursor } : {}),
          count:SYNC_PAGE_SIZE,
          options:{ include_personal_finance_category:true },
        })
        const data = response?.data || {}
        const nextCursor = String(data.next_cursor || '')
        hasMore = Boolean(data.has_more)

        if (!nextCursor || (hasMore && nextCursor === requestCursor)) {
          const error = new Error('Plaid transaction sync did not return a safe next cursor.')
          error.code = 'PLAID_SYNC_INVALID_CURSOR'
          throw error
        }

        added.push(...(Array.isArray(data.added) ? data.added : []))
        modified.push(...(Array.isArray(data.modified) ? data.modified : []))
        removed.push(...(Array.isArray(data.removed) ? data.removed : []))
        cursor = nextCursor
        pages += 1
      }

      return { added, modified, removed, nextCursor:cursor, pages, restarts }
    } catch (error) {
      if (plaidErrorCode(error) === SYNC_MUTATION_CODE && restarts < maxMutationRestarts) {
        restarts += 1
        continue
      }
      throw error
    }
  }
}

function pendingDeltaResult(cursorIdentity, pendingDelta, { replayed = false } = {}) {
  if (!pendingDelta || !Array.isArray(pendingDelta.transactions) || !Array.isArray(pendingDelta.removed) || !pendingDelta.batchId) {
    const error = new Error('The staged Plaid transaction batch is damaged.')
    error.code = 'PLAID_PENDING_DELTA_DAMAGED'
    throw error
  }
  return {
    pendingDelta,
    receipt:{ cursorIdentity, batchId:pendingDelta.batchId },
    replayed,
  }
}

function buildPendingDelta({ cursorIdentity, fromCursor, result, institution, itemId, createdAt }) {
  const consolidated = consolidateTransactionDelta(result.added, result.modified, result.removed)
  const transactions = consolidated.changed.map(({ transaction }) => mapPlaidTransaction(transaction, { institution, itemId }))
  const removed = consolidated.removed
  if (transactions.length > MAX_PENDING_TRANSACTIONS || removed.length > MAX_PENDING_REMOVALS) {
    const error = new Error('Plaid returned more transaction changes than Brevity can safely stage in one batch.')
    error.code = 'PLAID_SYNC_DELTA_LIMIT'
    throw error
  }
  const material = { cursorIdentity, fromCursor, nextCursor:result.nextCursor, transactions, removed, delta:consolidated.counts }
  if (Buffer.byteLength(JSON.stringify(material), 'utf8') > MAX_PENDING_BYTES) {
    const error = new Error('Plaid returned a transaction batch larger than Brevity can safely stage.')
    error.code = 'PLAID_SYNC_DELTA_LIMIT'
    throw error
  }
  const batchId = crypto.createHash('sha256').update(JSON.stringify(material)).digest('hex')
  return { batchId, fromCursor, nextCursor:result.nextCursor, transactions, removed, delta:consolidated.counts, createdAt }
}

async function syncAndStageItem({
  client,
  accessToken,
  itemId = '',
  institution = '',
  event,
  readState = getTransactionSyncState,
  writeState = setTransactionSyncState,
  now = () => new Date().toISOString(),
}) {
  const cursorIdentity = itemCursorIdentity(itemId, accessToken)
  const cursorEntry = await readState(cursorIdentity, event)
  if (cursorEntry.state?.pendingDelta) return pendingDeltaResult(cursorIdentity, cursorEntry.state.pendingDelta, { replayed:true })
  const initialCursor = String(cursorEntry.state?.cursor || '')
  const result = await syncItemTransactions({ client, accessToken, initialCursor })
  const pendingDelta = buildPendingDelta({
    cursorIdentity,
    fromCursor:initialCursor,
    result,
    institution,
    itemId,
    createdAt:now(),
  })
  const cursorState = {
    version:1,
    itemId,
    institution,
    cursor:initialCursor,
    pendingDelta,
    updatedAt:pendingDelta.createdAt,
  }

  try {
    await writeState(cursorIdentity, cursorState, event, cursorEntry)
  } catch (error) {
    if (plaidErrorCode(error) !== 'PLAID_CURSOR_CONFLICT') throw error
    const latest = await readState(cursorIdentity, event)
    if (!latest.state?.pendingDelta) throw error
    return pendingDeltaResult(cursorIdentity, latest.state.pendingDelta, { replayed:true })
  }

  return pendingDeltaResult(cursorIdentity, pendingDelta)
}

function transactionError(itemId, institution, error) {
  const code = plaidErrorCode(error) || 'PLAID_SYNC_ERROR'
  return {
    itemId,
    institution:institution || 'Connected institution',
    code,
    message:code === 'ITEM_LOGIN_REQUIRED'
      ? 'This bank connection needs to be re-authenticated.'
      : code === SYNC_MUTATION_CODE
        ? 'Transactions changed while Plaid was paging this institution. Brevity retained the prior verified history; try the refresh again.'
        : code === 'PLAID_CURSOR_CONFLICT'
          ? 'A newer transaction refresh completed first. Brevity retained the newer verified cursor; refresh again to load its delta.'
          : code === 'PLAID_SYNC_PAGE_LIMIT'
            ? 'This institution returned more transaction pages than Brevity can safely apply in one refresh.'
            : code === 'PLAID_SYNC_DELTA_LIMIT'
              ? 'This institution returned more transaction changes than Brevity can safely stage in one refresh.'
            : 'Transactions could not be refreshed for this institution.',
  }
}

function responseBody(overrides = {}) {
  return {
    connected:true,
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
    ...overrides,
  }
}

function lastSuccessfulTransactionUpdate(itemResponse) {
  return String(itemResponse?.data?.item?.status?.transactions?.last_successful_update || '')
}

function transactionRefreshCompleted(lastSuccessfulUpdate, requestedAt) {
  const updated = Date.parse(lastSuccessfulUpdate || '')
  const requested = Date.parse(requestedAt || '')
  return Number.isFinite(updated) && Number.isFinite(requested) && updated >= requested
}

exports.handler = async event => {
  const headers = {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'Content-Type',
    'Content-Type':'application/json',
    'Cache-Control':'no-store',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' }

  const params = new URLSearchParams(event.rawQuery || '')
  const requestRefresh = params.get('refresh') === '1'
  const refreshOnly = params.get('refresh_only') === '1'
  const refreshStatusOnly = params.get('refresh_status') === '1'

  try {
    const session = await readSession(event)
    if (!session) return { statusCode:401, headers, body:JSON.stringify({ error:'Sign in to view financial transactions.' }) }
    const tokens = await getTokens(event)
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return { statusCode:200, headers, body:JSON.stringify(responseBody({ connected:false, refresh:{ requested:requestRefresh, accepted:0, errors:[] } })) }
    }

    if (refreshStatusOnly) {
      const requestedAt = String(params.get('since') || '')
      if (!Number.isFinite(Date.parse(requestedAt))) {
        return { statusCode:400, headers, body:JSON.stringify({ error:'A valid transaction refresh start time is required.' }) }
      }
      const statuses = []
      const errors = []
      for (const { access_token:accessToken, item_id:itemId = '', institution = '' } of tokens) {
        try {
          const response = await plaidClient.itemGet({ access_token:accessToken })
          const lastSuccessfulUpdate = lastSuccessfulTransactionUpdate(response)
          statuses.push({ itemId, institution:institution || 'Connected institution', lastSuccessfulUpdate, complete:transactionRefreshCompleted(lastSuccessfulUpdate, requestedAt) })
        } catch (error) {
          const code = plaidErrorCode(error) || 'TRANSACTION_REFRESH_STATUS_FAILED'
          errors.push({ itemId, institution:institution || 'Connected institution', code, message:'Brevity could not confirm whether this bank finished updating transactions.' })
        }
      }
      const completed = statuses.filter(status => status.complete).length
      return { statusCode:200, headers, body:JSON.stringify(responseBody({
        refresh:{ requested:true, requestedAt, accepted:tokens.length, completed, stillProcessing:completed < tokens.length, errors, statuses },
      })) }
    }

    const changedTransactions = []
    const removedTransactionIds = new Set()
    const syncErrors = []
    const successfulInstitutions = new Set()
    const successfulItems = []
    const sourceReceipts = []
    const delta = { added:0, modified:0, removed:0 }
    const refresh = { requested:requestRefresh, requestedAt:requestRefresh ? new Date().toISOString() : '', accepted:0, errors:[] }

    for (const { access_token:accessToken, item_id:itemId = '', institution = '' } of tokens) {
      if (requestRefresh) {
        try {
          await plaidClient.transactionsRefresh({ access_token:accessToken })
          refresh.accepted += 1
        } catch (error) {
          const code = plaidErrorCode(error) || 'TRANSACTIONS_REFRESH_FAILED'
          console.error('Transactions refresh error for token:', error.response?.data || error.message)
          refresh.errors.push({
            itemId,
            institution:institution || 'Connected institution',
            code,
            message:code === 'PRODUCT_NOT_ENABLED'
              ? 'On-demand transaction updates are not enabled for this Plaid connection.'
              : 'The bank update could not be requested; Brevity is showing Plaid\'s latest available snapshot.',
          })
        }
      }
      if (refreshOnly) continue

      try {
        const { pendingDelta, receipt } = await syncAndStageItem({ client:plaidClient, accessToken, itemId, institution, event })
        pendingDelta.transactions.forEach(transaction => changedTransactions.push(transaction))
        pendingDelta.removed.forEach(transactionId => removedTransactionIds.add(transactionId))
        delta.added += Number(pendingDelta.delta?.added || 0)
        delta.modified += Number(pendingDelta.delta?.modified || 0)
        delta.removed += Number(pendingDelta.delta?.removed || 0)
        successfulItems.push(itemId || receipt.cursorIdentity)
        sourceReceipts.push(receipt)
        successfulInstitutions.add(institution || 'Connected institution')
      } catch (error) {
        console.error('Transactions sync error for token:', error.response?.data || error.message)
        syncErrors.push(transactionError(itemId, institution, error))
      }
    }

    if (refreshOnly) {
      return { statusCode:200, headers, body:JSON.stringify(responseBody({ refresh })) }
    }

    if (!successfulItems.length && syncErrors.length === tokens.length) {
      return {
        statusCode:502,
        headers,
        body:JSON.stringify(responseBody({
          error:'Transaction sync failed for every connected institution.',
          errors:syncErrors,
          refresh,
        })),
      }
    }

    const removed = [...removedTransactionIds]
    const transactions = changedTransactions
      .filter(transaction => !removedTransactionIds.has(transaction.id))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    const syncedAt = new Date().toISOString()
    return {
      statusCode:200,
      headers,
      body:JSON.stringify(responseBody({
        transactions,
        removed,
        count:transactions.length,
        delta,
        errors:syncErrors,
        refresh,
        syncedAt,
        successfulInstitutions:[...successfulInstitutions],
        successfulItems,
        sourceReceipts,
      })),
    }
  } catch (error) {
    return { statusCode:500, headers, body:JSON.stringify({ error:'Failed to fetch transactions', detail:error.message }) }
  }
}

exports.SYNC_MUTATION_CODE = SYNC_MUTATION_CODE
exports.consolidateTransactionDelta = consolidateTransactionDelta
exports.buildPendingDelta = buildPendingDelta
exports.itemCursorIdentity = itemCursorIdentity
exports.mapPlaidTransaction = mapPlaidTransaction
exports.pendingDeltaResult = pendingDeltaResult
exports.responseBody = responseBody
exports.lastSuccessfulTransactionUpdate = lastSuccessfulTransactionUpdate
exports.transactionRefreshCompleted = transactionRefreshCompleted
exports.syncAndStageItem = syncAndStageItem
exports.syncItemTransactions = syncItemTransactions
