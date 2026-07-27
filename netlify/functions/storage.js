// storage.js — Plaid token persistence via Netlify Blobs (prod) or /tmp (dev)
//
// Netlify's v1 function format doesn't auto-inject the Blobs context, so we
// configure the store manually using NETLIFY_SITE_ID + NETLIFY_TOKEN env vars.
// Both must be set in Netlify Site Settings → Environment Variables.
//
// Local dev fallback: tokens are written to /tmp/plaid-tokens.json

const fs = require('fs')
const path = require('path')

// Top-level require so esbuild always detects and bundles this dependency
let blobsGetStore = null
try {
  const blobs = require('@netlify/blobs')
  blobsGetStore = blobs.getStore
} catch (e) {
  console.error('[storage] @netlify/blobs not available:', e.message)
}

// /tmp is always writable in Netlify Functions; use it for local fallback
const LOCAL_FILE = process.env.PLAID_TOKEN_FILE || path.join('/tmp', 'plaid-tokens.json')

// Use Blobs when NETLIFY_SITE_ID is configured; fall back to /tmp otherwise
const useBlobStore = !!(blobsGetStore && process.env.NETLIFY_SITE_ID && process.env.NETLIFY_TOKEN)

function makeStore() {
  return blobsGetStore({
    name: 'plaid-tokens',
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN,
  })
}

async function getTokens() {
  if (useBlobStore) {
    try {
      const store = makeStore()
      const result = await store.get('tokens', { type: 'json' })
      console.log('[storage] getTokens blobs:', result ? `found ${result.length} token(s)` : 'null/empty')
      return result || []
    } catch (e) {
      console.error('[storage] getTokens blob error:', e.message)
      return []
    }
  }
  // /tmp fallback (dev or Blobs not configured)
  try {
    if (!fs.existsSync(LOCAL_FILE)) return []
    return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'))
  } catch (e) {
    console.error('[storage] getTokens local error:', e.message)
    return []
  }
}

async function setTokens(tokens) {
  if (useBlobStore) {
    try {
      const store = makeStore()
      await store.setJSON('tokens', tokens)
      console.log('[storage] setTokens blobs: saved', tokens.length, 'token(s)')
    } catch (e) {
      console.error('[storage] setTokens blob error:', e.message)
    }
    return
  }
  // /tmp fallback
  try {
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(tokens, null, 2))
  } catch (e) {
    console.error('[storage] setTokens local error:', e.message)
  }
}

module.exports = { getTokens, setTokens, useBlobStore }
