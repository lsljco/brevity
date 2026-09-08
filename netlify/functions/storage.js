// storage.js — Plaid token persistence via Netlify Blobs (prod) or /tmp (dev)
//
// Netlify's v1 function format doesn't auto-inject the Blobs context, so we
// use an explicitly configured NETLIFY_SITE_ID + NETLIFY_TOKEN when available,
// otherwise the scoped Blobs connection supplied by the Netlify runtime.
//
// Local dev fallback: tokens are written to /tmp/plaid-tokens.json

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// Top-level require so esbuild always detects and bundles this dependency
let blobsGetStore = null
let blobsConnectLambda = null
try {
  const blobs = require('@netlify/blobs')
  blobsGetStore = blobs.getStore
  blobsConnectLambda = blobs.connectLambda
} catch (e) {
  console.error('[storage] @netlify/blobs not available:', e.message)
}

// /tmp is always writable in Netlify Functions; use it for local fallback
const LOCAL_FILE = process.env.PLAID_TOKEN_FILE || path.join('/tmp', 'plaid-tokens.json')
const LOCAL_SYNC_FILE = process.env.PLAID_SYNC_CURSOR_FILE || path.join('/tmp', 'plaid-transaction-sync-cursors.json')

// Prefer API access when explicitly configured. On deployed Lambda-compatible
// functions Netlify supplies a scoped Blobs connection in event.blobs; use it
// instead of silently falling back to ephemeral /tmp storage.
const useBlobStore = !!blobsGetStore

function makeStore(event) {
  if (!blobsGetStore) return null
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_TOKEN) {
    return {
      store: blobsGetStore({
        name: 'plaid-tokens',
        consistency: 'strong',
        siteID: process.env.NETLIFY_SITE_ID,
        token: process.env.NETLIFY_TOKEN,
      }),
      consistency: 'strong',
      mode: 'api',
    }
  }
  if (event?.blobs && blobsConnectLambda) {
    blobsConnectLambda(event)
    return { store: blobsGetStore('plaid-tokens'), consistency: 'eventual', mode: 'runtime' }
  }
  try {
    // Current Netlify runtimes can pre-populate the Blobs context.
    return { store: blobsGetStore('plaid-tokens'), consistency: 'eventual', mode: 'runtime' }
  } catch {
    return null
  }
}

function makeSyncCursorStore(event) {
  if (!blobsGetStore) return null
  const options = { name:'plaid-transaction-sync', consistency:'strong' }
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_TOKEN) {
    return {
      store:blobsGetStore({ ...options, siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN }),
      mode:'api',
    }
  }
  if (event?.blobs && blobsConnectLambda) blobsConnectLambda(event)
  try {
    return { store:blobsGetStore(options), mode:'runtime' }
  } catch {
    return null
  }
}

function isHostedRuntime() {
  return process.env.NETLIFY === 'true' || Boolean(process.env.CONTEXT)
}

async function getTokens(event) {
  const backend = makeStore(event)
  if (backend) {
    try {
      const result = await backend.store.get('tokens', { type: 'json', consistency: backend.consistency })
      console.log('[storage] getTokens blobs:', result ? `found ${result.length} token(s)` : 'null/empty')
      return result || []
    } catch (e) {
      console.error('[storage] getTokens blob error:', e.message)
      throw new Error(`Plaid token storage could not be read: ${e.message}`)
    }
  }
  if (isHostedRuntime()) throw new Error('Persistent Plaid token storage is unavailable in this deployment.')
  // /tmp fallback (dev or Blobs not configured)
  try {
    if (!fs.existsSync(LOCAL_FILE)) return []
    return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'))
  } catch (e) {
    console.error('[storage] getTokens local error:', e.message)
    return []
  }
}

async function setTokens(tokens, event) {
  const backend = makeStore(event)
  if (backend) {
    try {
      const result = await backend.store.setJSON('tokens', tokens)
      if (result?.modified === false) throw new Error('The token record was not modified.')
      console.log('[storage] setTokens blobs: saved', tokens.length, 'token(s)')
      return { saved: true, count: tokens.length, mode: backend.mode }
    } catch (e) {
      console.error('[storage] setTokens blob error:', e.message)
      throw new Error(`Plaid token storage could not be saved: ${e.message}`)
    }
  }
  if (isHostedRuntime()) throw new Error('Persistent Plaid token storage is unavailable in this deployment.')
  // /tmp fallback
  try {
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(tokens, null, 2))
    const saved = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'))
    if (!Array.isArray(saved) || saved.length !== tokens.length) throw new Error('Token verification failed.')
    return { saved: true, count: tokens.length, mode: 'local' }
  } catch (e) {
    console.error('[storage] setTokens local error:', e.message)
    throw new Error(`Plaid token storage could not be saved: ${e.message}`)
  }
}

function syncCursorKey(itemId) {
  return `transaction-sync/${crypto.createHash('sha256').update(String(itemId || '')).digest('hex')}`
}

function localSyncStates() {
  try {
    if (!fs.existsSync(LOCAL_SYNC_FILE)) return {}
    const parsed = JSON.parse(fs.readFileSync(LOCAL_SYNC_FILE, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function localStateEtag(value) {
  return value ? crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex') : ''
}

async function getTransactionSyncState(itemId, event) {
  const key = syncCursorKey(itemId)
  const backend = makeSyncCursorStore(event)
  if (backend) {
    try {
      const entry = await backend.store.getWithMetadata(key, { type:'json' })
      return entry
        ? { state:entry.data, etag:entry.etag || '', exists:true }
        : { state:null, etag:'', exists:false }
    } catch (error) {
      if (error?.status === 404 || error?.statusCode === 404) return { state:null, etag:'', exists:false }
      throw new Error(`Plaid transaction cursor could not be read: ${error.message}`)
    }
  }
  if (isHostedRuntime()) throw new Error('Persistent Plaid transaction cursor storage is unavailable in this deployment.')
  const states = localSyncStates()
  const state = states[key] || null
  return { state, etag:localStateEtag(state), exists:Boolean(state) }
}

async function setTransactionSyncState(itemId, state, event, expected = {}) {
  const key = syncCursorKey(itemId)
  const backend = makeSyncCursorStore(event)
  if (backend) {
    if (expected.exists && !expected.etag) throw new Error('Plaid transaction cursor did not include a safe version marker.')
    try {
      const result = await backend.store.setJSON(key, state, expected.exists ? { onlyIfMatch:expected.etag } : { onlyIfNew:true })
      if (result?.modified === false) {
        const conflict = new Error('Plaid transaction cursor changed during this refresh.')
        conflict.code = 'PLAID_CURSOR_CONFLICT'
        throw conflict
      }
      return { state, etag:result?.etag || '', exists:true }
    } catch (error) {
      if (error?.code === 'PLAID_CURSOR_CONFLICT') throw error
      if (error?.status === 409 || error?.statusCode === 409 || error?.status === 412 || error?.statusCode === 412) {
        const conflict = new Error('Plaid transaction cursor changed during this refresh.')
        conflict.code = 'PLAID_CURSOR_CONFLICT'
        throw conflict
      }
      throw new Error(`Plaid transaction cursor could not be saved: ${error.message}`)
    }
  }
  if (isHostedRuntime()) throw new Error('Persistent Plaid transaction cursor storage is unavailable in this deployment.')
  const states = localSyncStates()
  const current = states[key] || null
  const currentEtag = localStateEtag(current)
  if ((expected.exists && (!current || currentEtag !== expected.etag)) || (!expected.exists && current)) {
    const conflict = new Error('Plaid transaction cursor changed during this refresh.')
    conflict.code = 'PLAID_CURSOR_CONFLICT'
    throw conflict
  }
  states[key] = state
  fs.writeFileSync(LOCAL_SYNC_FILE, JSON.stringify(states, null, 2))
  return { state, etag:localStateEtag(state), exists:true }
}

function transactionSyncReceiptError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

function normalizeTransactionSyncReceipt(receipt) {
  const cursorIdentity = String(receipt?.cursorIdentity || '').trim()
  const batchId = String(receipt?.batchId || '').trim()
  if (!cursorIdentity || cursorIdentity.length > 512 || !/^[a-zA-Z0-9:_-]+$/.test(cursorIdentity)) {
    throw transactionSyncReceiptError('The Plaid sync receipt does not identify a valid cursor record.', 'PLAID_RECEIPT_INVALID')
  }
  if (!/^[a-f0-9]{64}$/.test(batchId)) {
    throw transactionSyncReceiptError('The Plaid sync receipt does not identify a valid staged batch.', 'PLAID_RECEIPT_INVALID')
  }
  return { cursorIdentity, batchId }
}

async function verifyTransactionSyncReceipts(receipts, event, { readState = getTransactionSyncState } = {}) {
  if (!Array.isArray(receipts) || !receipts.length || receipts.length > 20) {
    throw transactionSyncReceiptError('A bounded set of Plaid sync receipts is required.', 'PLAID_RECEIPT_INVALID')
  }
  const normalized = receipts.map(normalizeTransactionSyncReceipt)
  if (new Set(normalized.map(receipt => receipt.cursorIdentity)).size !== normalized.length) {
    throw transactionSyncReceiptError('Plaid sync receipts contain a duplicate cursor record.', 'PLAID_RECEIPT_INVALID')
  }
  return Promise.all(normalized.map(async receipt => {
    const entry = await readState(receipt.cursorIdentity, event)
    const pending = entry.state?.pendingDelta
    if (!pending || pending.batchId !== receipt.batchId) {
      throw transactionSyncReceiptError('The Plaid sync receipt is no longer pending or does not match the staged batch.', 'PLAID_RECEIPT_MISMATCH')
    }
    if (!Array.isArray(pending.transactions) || !Array.isArray(pending.removed)) {
      throw transactionSyncReceiptError('The staged Plaid transaction batch is damaged.', 'PLAID_RECEIPT_DAMAGED')
    }
    return { receipt, state:entry.state, pendingDelta:pending }
  }))
}

async function ackTransactionSyncBatch(receipt, event, {
  readState = getTransactionSyncState,
  writeState = setTransactionSyncState,
  now = () => new Date().toISOString(),
} = {}) {
  const normalized = normalizeTransactionSyncReceipt(receipt)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const entry = await readState(normalized.cursorIdentity, event)
    if (!entry.state) throw transactionSyncReceiptError('The Plaid sync cursor record no longer exists.', 'PLAID_RECEIPT_MISMATCH')
    if (!entry.state.pendingDelta) {
      if (entry.state.lastAcknowledgedBatchId === normalized.batchId) return { acknowledged:true, alreadyAcknowledged:true, cursor:entry.state.cursor }
      throw transactionSyncReceiptError('The Plaid sync batch is no longer pending.', 'PLAID_RECEIPT_MISMATCH')
    }
    if (entry.state.pendingDelta.batchId !== normalized.batchId) {
      throw transactionSyncReceiptError('A newer Plaid sync batch is pending for this item.', 'PLAID_RECEIPT_MISMATCH')
    }
    const next = {
      ...entry.state,
      cursor:entry.state.pendingDelta.nextCursor,
      pendingDelta:null,
      lastAcknowledgedBatchId:normalized.batchId,
      acknowledgedAt:now(),
    }
    try {
      await writeState(normalized.cursorIdentity, next, event, entry)
      return { acknowledged:true, alreadyAcknowledged:false, cursor:next.cursor }
    } catch (error) {
      if (error?.code !== 'PLAID_CURSOR_CONFLICT' || attempt === 2) throw error
    }
  }
  throw transactionSyncReceiptError('The Plaid sync batch could not be acknowledged safely.', 'PLAID_CURSOR_CONFLICT')
}

module.exports = {
  getTokens,
  setTokens,
  getTransactionSyncState,
  setTransactionSyncState,
  verifyTransactionSyncReceipts,
  ackTransactionSyncBatch,
  normalizeTransactionSyncReceipt,
  syncCursorKey,
  useBlobStore,
}
