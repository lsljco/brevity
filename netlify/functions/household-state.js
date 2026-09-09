const { getStore } = require('@netlify/blobs')
const { isDeepStrictEqual } = require('node:util')
const { readSession } = require('./household-auth')
const { verifyTransactionSyncReceipts, ackTransactionSyncBatch } = require('./storage')
const { verifyAccountSourceReceipt, mergeVerifiedPlaidBalances } = require('../lib/plaid-account-source.cjs')

const STORE_NAME = 'brevity-household-state'
const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const ALLOWED_KEYS = new Set([
  'lslj_finance_v9','plaid_actuals_cache','lslj_budget_v1','lslj_actuals_v1','lslj_tx_overrides_v1','lslj_tx_rules_v1',
  'brevity_finance_categories_v1','brevity_finance_scenarios_v1','fp_goals','homehq_items_v1','family_calendar_events_v1',
  'brevity_daily_financial_alignment_v1','brevity_finance_timeframe_v1','brevity_finance_meetings_v1','brevity_household_maintenance_v1',
  'brevity_household_inventory_v1','brevity_household_finance_bridge_v1','brevity_household_schedule_v1',
])
const KEY_WRITE_DOMAINS = Object.freeze({
  lslj_finance_v9:'finance',
  plaid_actuals_cache:'finance',
  lslj_budget_v1:'finance',
  lslj_actuals_v1:'finance',
  lslj_tx_overrides_v1:'finance',
  lslj_tx_rules_v1:'finance',
  brevity_finance_categories_v1:'finance',
  brevity_finance_scenarios_v1:'finance',
  fp_goals:'finance',
  homehq_items_v1:'projects',
  family_calendar_events_v1:'calendar',
  brevity_daily_financial_alignment_v1:'finance',
  // This is a view preference, not a change to financial truth.
  brevity_finance_timeframe_v1:'planning',
  brevity_finance_meetings_v1:'finance',
  brevity_household_maintenance_v1:'planning',
  brevity_household_inventory_v1:'planning',
  brevity_household_finance_bridge_v1:'finance',
  brevity_household_schedule_v1:'planning',
})
const ADMIN_WRITE_KEYS = new Set([
  'lslj_finance_v9','plaid_actuals_cache','lslj_budget_v1','lslj_actuals_v1','lslj_tx_overrides_v1','lslj_tx_rules_v1',
  'brevity_finance_categories_v1','brevity_finance_scenarios_v1','fp_goals','brevity_daily_financial_alignment_v1',
  'brevity_finance_meetings_v1','brevity_household_finance_bridge_v1',
])
const PLAID_SOURCE_KEYS = new Set(['lslj_finance_v9', 'plaid_actuals_cache'])
const PLAID_ACCOUNT_FIELDS = new Set([
  'balance', 'plaidAccountId', 'plaidItemId', 'plaidName', 'plaidOfficialName', 'plaidType', 'plaidSubtype',
  'institution', 'mask', 'plaidCurrentBalance', 'plaidAvailableBalance',
])
const PLAID_TRANSACTION_FIELDS = new Set([
  'id', 'accountId', 'itemId', 'name', 'originalStatement', 'amount', 'date', 'category', 'type', 'institution', 'pending',
])
const headers = {
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-headers':'content-type',
  'access-control-allow-methods':'GET,PUT,OPTIONS',
}
const response = (statusCode, body) => ({ statusCode, headers, body:JSON.stringify(body) })
const recordKey = key => `${HOUSEHOLD_ID}/records/${key}`
const store = () => getStore({ name:STORE_NAME, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
const normalizeVersion = record => Math.max(0, Number(record?.version || 0))
const hasExpectedVersion = body => body.expectedVersion !== undefined && body.expectedVersion !== null
const validExpectedVersion = body => Number.isInteger(Number(body.expectedVersion)) && Number(body.expectedVersion) >= 0
const readRecordEntry = async (dataStore, key) => {
  const entry = await dataStore.getWithMetadata(recordKey(key), { type:'json' })
  return entry ? { record:entry.data, etag:entry.etag || '' } : { record:null, etag:'' }
}
const hashValue = (value = '') => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}
const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
const boundedString = (value, limit, { required = false } = {}) => {
  if (typeof value !== 'string') return !required && (value === undefined || value === null)
  const length = value.trim().length
  return required ? length > 0 && length <= limit : length <= limit
}
const parseRecordValue = value => {
  try { return { value:JSON.parse(value) } }
  catch { return { error:'The source snapshot must contain valid JSON.' } }
}

function validatePlaidTransactions(candidate, existing) {
  if (!Array.isArray(candidate)) return 'The Plaid transaction snapshot must be an array.'
  if (candidate.length > 100_000) return 'The Plaid transaction snapshot contains too many records.'
  const priorById = new Map((Array.isArray(existing) ? existing : []).filter(isPlainObject).map(item => [String(item.id || ''), item]))
  const ids = new Set()
  for (const transaction of candidate) {
    if (!isPlainObject(transaction)) return 'Every Plaid transaction must be an object.'
    if (!boundedString(transaction.id, 512, { required:true })) return 'Every Plaid transaction requires a bounded source id.'
    if (ids.has(transaction.id)) return 'The Plaid transaction snapshot contains duplicate source ids.'
    ids.add(transaction.id)
    if (!boundedString(transaction.accountId, 512, { required:true })) return `Plaid transaction ${transaction.id} is missing its source account id.`
    if (!boundedString(transaction.itemId, 512) || !boundedString(transaction.name, 1000) || !boundedString(transaction.originalStatement, 2000) ||
        !boundedString(transaction.category, 512) || !boundedString(transaction.institution, 512)) {
      return `Plaid transaction ${transaction.id} contains source text that is too long.`
    }
    if (!Number.isFinite(transaction.amount) || Math.abs(transaction.amount) > 1_000_000_000_000) return `Plaid transaction ${transaction.id} has an invalid amount.`
    if (typeof transaction.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(transaction.date) || Number.isNaN(Date.parse(`${transaction.date}T00:00:00Z`))) {
      return `Plaid transaction ${transaction.id} has an invalid date.`
    }
    if (transaction.type !== 'income' && transaction.type !== 'expense') return `Plaid transaction ${transaction.id} has an invalid direction.`
    if (typeof transaction.pending !== 'boolean') return `Plaid transaction ${transaction.id} is missing its pending status.`

    // Older verified source rows may carry now-retired source fields. They may
    // be retained during a partial-institution merge, but a browser may not
    // introduce or change those fields through this endpoint.
    const prior = priorById.get(transaction.id)
    for (const key of Object.keys(transaction)) {
      if (PLAID_TRANSACTION_FIELDS.has(key)) continue
      if (!prior || !Object.hasOwn(prior, key) || !isDeepStrictEqual(transaction[key], prior[key])) {
        return `Plaid transaction ${transaction.id} contains an unsupported field.`
      }
    }
  }
  return ''
}

function validateStagedTransactionBatches(batches) {
  if (!Array.isArray(batches) || !batches.length || batches.length > 20) {
    return 'A bounded set of verified Plaid transaction batches is required.'
  }
  for (const batch of batches) {
    const pending = batch?.pendingDelta
    const state = batch?.state
    if (!isPlainObject(pending) || !isPlainObject(state)) return 'A verified Plaid transaction batch is damaged.'
    if (!Array.isArray(pending.transactions) || pending.transactions.length > 10_000 ||
        !Array.isArray(pending.removed) || pending.removed.length > 10_000) {
      return 'A verified Plaid transaction batch exceeds the safe source-ingestion limit.'
    }
    if (!boundedString(pending.batchId, 64, { required:true }) || pending.batchId !== batch?.receipt?.batchId ||
        !boundedString(pending.nextCursor, 4096, { required:true }) || !boundedString(pending.fromCursor, 4096)) {
      return 'A verified Plaid transaction batch has invalid cursor metadata.'
    }
    if (String(state.cursor || '') !== String(pending.fromCursor || '')) {
      return 'A verified Plaid transaction batch no longer starts at the acknowledged cursor.'
    }
    const removedIds = new Set()
    for (const transactionId of pending.removed) {
      if (!boundedString(transactionId, 512, { required:true }) || removedIds.has(transactionId)) {
        return 'A verified Plaid transaction batch contains invalid removals.'
      }
      removedIds.add(transactionId)
    }
    for (const transaction of pending.transactions) {
      if (!isPlainObject(transaction)) return 'A verified Plaid transaction batch contains an invalid source row.'
      if (state.itemId && transaction.itemId !== state.itemId) return 'A verified Plaid transaction batch contains the wrong source item.'
      if (state.institution && transaction.institution !== state.institution) return 'A verified Plaid transaction batch contains the wrong source institution.'
    }
  }
  return ''
}

function applyStagedTransactionBatches(existing, batches) {
  const merged = new Map((Array.isArray(existing) ? existing : []).filter(transaction => transaction?.id).map(transaction => [transaction.id, transaction]))
  const removed = new Set()
  const changed = []
  for (const batch of batches) {
    for (const transactionId of batch.pendingDelta.removed) removed.add(transactionId)
    for (const transaction of batch.pendingDelta.transactions) changed.push(transaction)
  }
  for (const transactionId of removed) merged.delete(transactionId)
  for (const transaction of changed) {
    if (transaction?.id && !removed.has(transaction.id)) merged.set(transaction.id, transaction)
  }
  return [...merged.values()].sort((left, right) => String(right?.date || '').localeCompare(String(left?.date || '')))
}

function withoutPlaidAccountFields(account) {
  return Object.fromEntries(Object.entries(account).filter(([key]) => !PLAID_ACCOUNT_FIELDS.has(key)))
}

function validatePlaidFinanceUpdate(candidate, existing) {
  if (!isPlainObject(existing)) return 'Plaid balances cannot initialize a missing finance plan. Create it through reviewed Action Mode first.'
  if (!isPlainObject(candidate)) return 'The finance source snapshot must be an object.'
  if (!Array.isArray(existing.accounts) || !Array.isArray(candidate.accounts) || existing.accounts.length !== candidate.accounts.length) {
    return 'Plaid balance refresh cannot add, remove, or reorder household accounts.'
  }
  const existingWithoutAccounts = { ...existing }
  const candidateWithoutAccounts = { ...candidate }
  delete existingWithoutAccounts.accounts
  delete candidateWithoutAccounts.accounts
  if (!isDeepStrictEqual(candidateWithoutAccounts, existingWithoutAccounts)) {
    return 'Plaid balance refresh may update only source-managed account fields.'
  }
  for (let index = 0; index < existing.accounts.length; index += 1) {
    const prior = existing.accounts[index]
    const next = candidate.accounts[index]
    if (!isPlainObject(prior) || !isPlainObject(next) || !boundedString(prior.id, 512, { required:true }) || next.id !== prior.id) {
      return 'Plaid balance refresh cannot replace household account identities.'
    }
    if (!isDeepStrictEqual(withoutPlaidAccountFields(next), withoutPlaidAccountFields(prior))) {
      return `Plaid balance refresh may not change household-managed fields for account ${prior.id}.`
    }
    if (!Number.isFinite(next.balance) || Math.abs(next.balance) > 1_000_000_000_000) return `Plaid returned an invalid balance for account ${prior.id}.`
    if (next.plaidCurrentBalance !== undefined && (!Number.isFinite(next.plaidCurrentBalance) || Math.abs(next.plaidCurrentBalance) > 1_000_000_000_000)) {
      return `Plaid returned an invalid current balance for account ${prior.id}.`
    }
    if (next.plaidAvailableBalance !== undefined && (!Number.isFinite(next.plaidAvailableBalance) || Math.abs(next.plaidAvailableBalance) > 1_000_000_000_000)) {
      return `Plaid returned an invalid available balance for account ${prior.id}.`
    }
    for (const field of ['plaidAccountId','plaidItemId','plaidName','plaidOfficialName','plaidType','plaidSubtype','institution','mask']) {
      if (!boundedString(next[field], 512)) return `Plaid returned invalid ${field} metadata for account ${prior.id}.`
    }
  }
  return ''
}

async function readHouseholdRecords(dataStore) {
  const records = {}
  await Promise.all([...ALLOWED_KEYS].map(async key => {
    // Netlify Blobs returns null for a genuinely absent key. Let transport,
    // authorization, and service errors propagate so clients never mistake an
    // outage for an empty household and upload stale local state over it.
    const { record } = await readRecordEntry(dataStore, key)
    if (record?.value != null) {
      // Action Mode releases before the hash contract was enforced stored a
      // literal marker here. Repair only that known legacy marker on read so
      // existing reviewed records become verifiable without weakening checks
      // for any other malformed hash.
      const hash = record.hash === 'assistant-action' ? hashValue(record.value) : record.hash
      records[key] = { ...record, hash, version:normalizeVersion(record) }
    }
  }))
  return records
}

function sharedStateWritePermission({ session, key, memberPermissions }) {
  if (session?.role === 'admin') return { allowed:true, domain:KEY_WRITE_DOMAINS[key] || '' }
  const domain = KEY_WRITE_DOMAINS[key]
  if (!domain) return { allowed:false, domain:'', reason:'This household data type does not have a write permission.' }
  if (ADMIN_WRITE_KEYS.has(key) || domain === 'finance') {
    return { allowed:false, domain, reason:'Financial administration requires household-administrator access.' }
  }
  if (!memberPermissions?.[domain]) {
    return { allowed:false, domain, reason:`${domain[0].toUpperCase()}${domain.slice(1)} changes are not enabled for ${session?.member || 'this member'}.` }
  }
  return { allowed:true, domain }
}

function reviewedActionRequired(key) {
  return {
    statusCode:403,
    body:{
      error:'This household record can only be changed through reviewed Action Mode so Brevity can enforce schema ownership, record an audit entry, and provide safe Undo.',
      code:'ACTION_REVIEW_REQUIRED',
      domain:KEY_WRITE_DOMAINS[key] || '',
    },
  }
}

function conflictResult(record, expectedVersion, message = 'This household record changed before your update was saved.') {
  const actualVersion = normalizeVersion(record)
  return {
    statusCode:200,
    body:{ conflict:true, conflictType:'version', record:record ? { ...record, version:actualVersion } : null, expectedVersion, actualVersion, error:message },
  }
}

async function writeHouseholdRecord({ dataStore, session, memberPermissions, body, now = () => new Date() }) {
  const key = String(body.key || '')
  if (!ALLOWED_KEYS.has(key)) return { statusCode:400, body:{ error:'This data type cannot be synchronized.' } }
  return reviewedActionRequired(key)
}

async function writePlaidSourceRecord({
  dataStore,
  session,
  body,
  event,
  now = () => new Date(),
  verifySourceReceipts = verifyTransactionSyncReceipts,
  acknowledgeSourceReceipt = ackTransactionSyncBatch,
  verifyAccountReceipt = verifyAccountSourceReceipt,
}) {
  const key = String(body.key || '')
  if (body.writeMode !== 'source-ingestion' || body.source !== 'plaid' || !PLAID_SOURCE_KEYS.has(key)) {
    return { statusCode:400, body:{ error:'This source-ingestion request is not supported.', code:'INVALID_SOURCE_INGESTION' } }
  }
  if (session?.role !== 'admin') {
    return { statusCode:403, body:{ error:'Refreshing household bank source records requires household-administrator access.', code:'SOURCE_INGESTION_FORBIDDEN', domain:'finance' } }
  }
  if (typeof body.value !== 'string') return { statusCode:400, body:{ error:'A serialized source snapshot is required.' } }
  if (Buffer.byteLength(body.value, 'utf8') > 5_000_000) return { statusCode:413, body:{ error:'This source snapshot is too large to synchronize.' } }
  if (!hasExpectedVersion(body) || !validExpectedVersion(body)) return { statusCode:400, body:{ error:'An exact non-negative expectedVersion is required for source ingestion.' } }
  const calculatedHash = hashValue(body.value)
  if (body.hash !== calculatedHash) return { statusCode:400, body:{ error:'The source snapshot hash does not match its serialized value.' } }

  const entry = await readRecordEntry(dataStore, key)
  const existing = entry.record
  const existingVersion = normalizeVersion(existing)
  const expectedVersion = Number(body.expectedVersion)
  if (existing && expectedVersion !== existingVersion) return conflictResult(existing, expectedVersion)
  if (!existing && expectedVersion !== 0) {
    return { statusCode:409, body:{ error:'This household record no longer exists at the version you reviewed.', conflict:true, conflictType:'version', record:null, expectedVersion, actualVersion:0 } }
  }
  if (existing && !entry.etag) throw new Error('The synchronized household record did not include a safe version marker.')

  const parsedCandidate = parseRecordValue(body.value)
  if (parsedCandidate.error) return { statusCode:400, body:{ error:parsedCandidate.error } }
  const parsedExisting = existing ? parseRecordValue(existing.value) : { value:null }
  if (parsedExisting.error) throw new Error('The existing synchronized household record is damaged and cannot be safely refreshed.')
  if (key === 'lslj_finance_v9' && !isPlainObject(parsedExisting.value)) {
    return { statusCode:422, body:{ error:'Plaid balances cannot initialize a missing finance plan. Create it through reviewed Action Mode first.', code:'SOURCE_SCHEMA_REJECTED' } }
  }
  if (key === 'lslj_finance_v9') {
    const schemaError = validatePlaidFinanceUpdate(parsedCandidate.value, parsedExisting.value)
    if (schemaError) return { statusCode:422, body:{ error:schemaError, code:'SOURCE_SCHEMA_REJECTED' } }
  }

  let verifiedBatches = []
  let accountReceiptWatermark = null
  if (key === 'plaid_actuals_cache') {
    if (existing && !Array.isArray(parsedExisting.value)) {
      throw new Error('The existing synchronized transaction record is damaged and cannot be safely refreshed.')
    }
    try {
      verifiedBatches = await verifySourceReceipts(body.sourceReceipts, event)
    } catch (error) {
      const invalidReceipt = ['PLAID_RECEIPT_INVALID','PLAID_RECEIPT_MISMATCH','PLAID_RECEIPT_DAMAGED'].includes(error?.code)
      return {
        statusCode:invalidReceipt ? 409 : 503,
        body:{
          error:invalidReceipt
            ? 'The Plaid transaction source receipt is missing, expired, or no longer matches the staged bank batch. Refresh bank data and try again.'
            : 'Plaid transaction source verification is temporarily unavailable. The prior verified transaction history was kept.',
          code:invalidReceipt ? 'SOURCE_RECEIPT_REJECTED' : 'SOURCE_RECEIPT_UNAVAILABLE',
        },
      }
    }
    const stagedError = validateStagedTransactionBatches(verifiedBatches)
    if (stagedError) return { statusCode:422, body:{ error:stagedError, code:'SOURCE_RECEIPT_REJECTED' } }
    const exactCandidate = applyStagedTransactionBatches(parsedExisting.value, verifiedBatches)
    if (!isDeepStrictEqual(parsedCandidate.value, exactCandidate)) {
      return {
        statusCode:422,
        body:{
          error:'The submitted transaction snapshot does not exactly match the verified Plaid changes and prior household history.',
          code:'SOURCE_SNAPSHOT_MISMATCH',
        },
      }
    }
  } else {
    if (body.sourceReceipts !== undefined) return { statusCode:400, body:{ error:'Transaction source receipts are not valid for a balance refresh.', code:'INVALID_SOURCE_INGESTION' } }
    let verifiedAccountSnapshot
    try {
      verifiedAccountSnapshot = await verifyAccountReceipt(body.accountSourceReceipt)
    } catch (error) {
      const unavailable = error?.code === 'PLAID_ACCOUNT_RECEIPT_UNAVAILABLE'
      return {
        statusCode:unavailable ? 503 : 409,
        body:{
          error:unavailable
            ? 'Plaid account source verification is temporarily unavailable. The prior verified balances were kept.'
            : 'The Plaid account source receipt is missing, expired, or does not match the bank snapshot. Refresh balances and try again.',
          code:unavailable ? 'SOURCE_RECEIPT_UNAVAILABLE' : 'SOURCE_RECEIPT_REJECTED',
        },
      }
    }
    const verifiedAccounts = verifiedAccountSnapshot?.accounts
    accountReceiptWatermark = {
      issuedAt:Number(verifiedAccountSnapshot?.issuedAt),
      receiptId:String(verifiedAccountSnapshot?.receiptId || ''),
    }
    if (!Array.isArray(verifiedAccounts) || !Number.isFinite(accountReceiptWatermark.issuedAt) || !/^[a-f0-9]{64}$/.test(accountReceiptWatermark.receiptId)) {
      return { statusCode:409, body:{ error:'The Plaid balance receipt is missing its monotonic source identity. Refresh balances and try again.', code:'SOURCE_RECEIPT_REJECTED' } }
    }
    const priorWatermark = existing?.plaidAccountReceipt
    if (priorWatermark) {
      const priorIssuedAt = Number(priorWatermark.issuedAt)
      const priorReceiptId = String(priorWatermark.receiptId || '')
      const older = !Number.isFinite(priorIssuedAt) || accountReceiptWatermark.issuedAt < priorIssuedAt
      const conflictingSameTime = accountReceiptWatermark.issuedAt === priorIssuedAt && accountReceiptWatermark.receiptId !== priorReceiptId
      const changedReplay = accountReceiptWatermark.receiptId === priorReceiptId && existing?.value !== body.value
      if (older || conflictingSameTime || changedReplay) {
        return { statusCode:409, body:{ error:'This Plaid balance receipt is older than, conflicts with, or replays the last applied balance snapshot. The newer stored balances were kept.', code:'SOURCE_RECEIPT_REPLAYED' } }
      }
    }
    // Compare the same JSON representation the browser submits; optional
    // source fields with an undefined value are omitted during serialization.
    let exactCandidate
    try {
      exactCandidate = JSON.parse(JSON.stringify(mergeVerifiedPlaidBalances(parsedExisting.value, verifiedAccounts)))
    } catch (error) {
      if (['PLAID_ACCOUNT_LINKAGE_AMBIGUOUS','PLAID_ACCOUNT_LINKAGE_INCOMPATIBLE'].includes(error?.code)) {
        return {
          statusCode:422,
          body:{
            error:error.message,
            code:error.code === 'PLAID_ACCOUNT_LINKAGE_INCOMPATIBLE'
              ? 'SOURCE_ACCOUNT_LINKAGE_INCOMPATIBLE'
              : 'SOURCE_SCHEMA_REJECTED',
          },
        }
      }
      throw error
    }
    if (!isDeepStrictEqual(parsedCandidate.value, exactCandidate)) {
      return { statusCode:422, body:{ error:'The submitted finance snapshot does not exactly match the server-verified Plaid balances and prior household plan.', code:'SOURCE_SNAPSHOT_MISMATCH' } }
    }
  }
  const validationError = key === 'plaid_actuals_cache'
    ? validatePlaidTransactions(parsedCandidate.value, parsedExisting.value)
    : validatePlaidFinanceUpdate(parsedCandidate.value, parsedExisting.value)
  if (validationError) return { statusCode:422, body:{ error:validationError, code:'SOURCE_SCHEMA_REJECTED' } }

  // A source refresh still verifies its reviewed version, but an identical
  // snapshot does not need to manufacture a new household-state version.
  let record
  let unchanged = false
  const watermarkAlreadyApplied = key !== 'lslj_finance_v9'
    || (existing?.plaidAccountReceipt?.issuedAt === accountReceiptWatermark?.issuedAt
      && existing?.plaidAccountReceipt?.receiptId === accountReceiptWatermark?.receiptId)
  if (existing && existing.value === body.value && String(existing.hash || '') === calculatedHash && watermarkAlreadyApplied) {
    record = { ...existing, version:existingVersion }
    unchanged = true
  } else {
    record = {
      key,
      value:body.value,
      hash:calculatedHash,
      version:existingVersion + 1,
      updatedAt:now().toISOString(),
      updatedBy:session.member,
      source:'plaid',
      ...(accountReceiptWatermark ? { plaidAccountReceipt:accountReceiptWatermark } : {}),
    }
    const writeOptions = existing ? { onlyIfMatch:entry.etag } : { onlyIfNew:true }
    const writeResult = await dataStore.setJSON(recordKey(key), record, writeOptions)
    if (writeResult?.modified === false) {
      const latest = (await readRecordEntry(dataStore, key)).record
      return conflictResult(latest, expectedVersion, 'Household data changed while this update was being saved. Refresh and try again.')
    }
  }

  // The household snapshot is durable before any cursor can advance. If an
  // acknowledgement fails, return the durable record plus an explicit retry
  // marker; the pending delta will replay on the next refresh.
  if (key === 'plaid_actuals_cache') {
    const acknowledgements = await Promise.allSettled(verifiedBatches.map(batch => acknowledgeSourceReceipt(batch.receipt, event)))
    const failed = acknowledgements.filter(result => result.status === 'rejected')
    if (failed.length) {
      return {
        statusCode:200,
        body:{
          record,
          conflict:false,
          unchanged,
          sourceAcknowledgementPending:true,
          error:'The verified transaction snapshot was saved, but one or more bank cursors could not be acknowledged. Transactions are marked stale and the safe retry will replay those changes.',
        },
      }
    }
  }
  return { statusCode:200, body:{ record, conflict:false, unchanged } }
}

exports.ADMIN_WRITE_KEYS = ADMIN_WRITE_KEYS
exports.KEY_WRITE_DOMAINS = KEY_WRITE_DOMAINS
exports.sharedStateWritePermission = sharedStateWritePermission
exports.writeHouseholdRecord = writeHouseholdRecord
exports.writePlaidSourceRecord = writePlaidSourceRecord
exports.validatePlaidFinanceUpdate = validatePlaidFinanceUpdate
exports.validatePlaidTransactions = validatePlaidTransactions
exports.validateStagedTransactionBatches = validateStagedTransactionBatches
exports.applyStagedTransactionBatches = applyStagedTransactionBatches
exports.readHouseholdRecords = readHouseholdRecords

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode:204, headers, body:'' }
  try {
    const session = await readSession(event)
    if (!session) return response(401, { error:'Sign in to synchronize household data.' })
    const dataStore = store()

    if (event.httpMethod === 'GET') {
      const records = await readHouseholdRecords(dataStore)
      return response(200, { householdId:HOUSEHOLD_ID, records, serverTime:new Date().toISOString() })
    }

    if (event.httpMethod === 'PUT') {
      let body
      try { body = JSON.parse(event.body || '{}') } catch { return response(400, { error:'Invalid JSON body.' }) }
      const result = body.writeMode === 'source-ingestion'
        ? await writePlaidSourceRecord({ dataStore, session, body, event })
        : await writeHouseholdRecord({ dataStore, session, body })
      return response(result.statusCode, result.body)
    }

    return response(405, { error:'Method not allowed.' })
  } catch (error) {
    console.error('[household-state]', error)
    return response(500, { error:'Household synchronization is temporarily unavailable.' })
  }
}
