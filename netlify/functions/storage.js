// storage.js — token storage with local file fallback for dev
const fs = require('fs')
const path = require('path')

const LOCAL_FILE = process.env.PLAID_TOKEN_FILE || path.join(process.cwd(), '.plaid-tokens.json')

async function getTokens() {
  try {
    if (process.env.NETLIFY_SITE_ID && !process.env.NETLIFY_DEV) {
      const { getStore } = require('@netlify/blobs')
      const store = getStore({ name: 'plaid-tokens', consistency: 'strong' })
      return await store.get('tokens', { type: 'json' }).catch(() => [])
    }
    if (!fs.existsSync(LOCAL_FILE)) return []
    return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'))
  } catch { return [] }
}

async function setTokens(tokens) {
  try {
    if (process.env.NETLIFY_SITE_ID && !process.env.NETLIFY_DEV) {
      const { getStore } = require('@netlify/blobs')
      const store = getStore({ name: 'plaid-tokens', consistency: 'strong' })
      await store.setJSON('tokens', tokens)
    } else {
      fs.writeFileSync(LOCAL_FILE, JSON.stringify(tokens, null, 2))
    }
  } catch (e) { console.error('Storage write error:', e.message) }
}

module.exports = { getTokens, setTokens }
