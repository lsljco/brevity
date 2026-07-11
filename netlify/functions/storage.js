// storage.js — token storage with local file fallback for dev
const fs = require('fs')
const path = require('path')

// Top-level require so esbuild/nft always detect and bundle this dependency
let blobsGetStore = null
try {
  const blobs = require('@netlify/blobs')
  blobsGetStore = blobs.getStore
} catch (e) {
  console.error('[storage] @netlify/blobs not available:', e.message)
}

const LOCAL_FILE = process.env.PLAID_TOKEN_FILE || path.join(process.cwd(), '.plaid-tokens.json')
// NETLIFY is always "true" in deployed functions; NETLIFY_DEV is "true" in local dev
const isNetlify = !!(process.env.NETLIFY && !process.env.NETLIFY_DEV)

async function getTokens() {
  if (isNetlify) {
    if (!blobsGetStore) {
      console.error('[storage] getTokens: @netlify/blobs not loaded')
      return []
    }
    try {
      const store = blobsGetStore({ name: 'plaid-tokens', consistency: 'strong' })
      const result = await store.get('tokens', { type: 'json' })
      console.log('[storage] getTokens:', result ? `found ${result.length} token(s)` : 'null/empty')
      return result || []
    } catch (e) {
      console.error('[storage] getTokens blob error:', e.message)
      return []
    }
  }
  try {
    if (!fs.existsSync(LOCAL_FILE)) return []
    return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'))
  } catch (e) {
    console.error('[storage] getTokens local error:', e.message)
    return []
  }
}

async function setTokens(tokens) {
  if (isNetlify) {
    if (!blobsGetStore) {
      console.error('[storage] setTokens: @netlify/blobs not loaded — token NOT saved')
      return
    }
    try {
      const store = blobsGetStore({ name: 'plaid-tokens', consistency: 'strong' })
      await store.setJSON('tokens', tokens)
      console.log('[storage] setTokens: saved', tokens.length, 'token(s)')
    } catch (e) {
      console.error('[storage] setTokens blob error:', e.message)
    }
    return
  }
  try {
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(tokens, null, 2))
  } catch (e) {
    console.error('[storage] setTokens local error:', e.message)
  }
}

module.exports = { getTokens, setTokens }
