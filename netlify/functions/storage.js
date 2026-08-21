// storage.js — Plaid token persistence via Netlify Blobs (prod) or /tmp (dev)
//
// Netlify's v1 function format doesn't auto-inject the Blobs context, so we
// use an explicitly configured NETLIFY_SITE_ID + NETLIFY_TOKEN when available,
// otherwise the scoped Blobs connection supplied by the Netlify runtime.
//
// Local dev fallback: tokens are written to /tmp/plaid-tokens.json

const fs = require('fs')
const path = require('path')

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

module.exports = { getTokens, setTokens, useBlobStore }
