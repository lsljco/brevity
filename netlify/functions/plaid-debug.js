// plaid-debug.js — surfaces Plaid/Blobs status to the browser for diagnosis
const { getTokens, useBlobStore } = require('./storage')

let blobsGetStore = null
try {
  const blobs = require('@netlify/blobs')
  blobsGetStore = blobs.getStore
} catch (e) {}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  try {
    const tokens = await getTokens()

    // Test write + read cycle using the same config as storage.js
    let writeReadTest = 'not run'
    if (blobsGetStore && process.env.NETLIFY_SITE_ID && process.env.NETLIFY_TOKEN) {
      try {
        const store = blobsGetStore({
          name: 'plaid-tokens',
          consistency: 'strong',
          siteID: process.env.NETLIFY_SITE_ID,
          token: process.env.NETLIFY_TOKEN,
        })
        const canary = { _test: true, ts: Date.now() }
        await store.setJSON('_debug_canary', canary)
        const back = await store.get('_debug_canary', { type: 'json' })
        writeReadTest = back?._test === true ? 'PASS' : `FAIL — got ${JSON.stringify(back)}`
        await store.delete('_debug_canary')
      } catch (e) {
        writeReadTest = `ERROR: ${e.message}`
      }
    } else if (!blobsGetStore) {
      writeReadTest = 'skipped — @netlify/blobs not loaded'
    } else {
      writeReadTest = 'skipped — NETLIFY_SITE_ID or NETLIFY_TOKEN not set'
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        env: {
          NETLIFY_SITE_ID: process.env.NETLIFY_SITE_ID ? '✓ set' : '✗ MISSING — add to Netlify env vars',
          NETLIFY_TOKEN: process.env.NETLIFY_TOKEN ? '✓ set' : '✗ MISSING — add to Netlify env vars',
          PLAID_ENV: process.env.PLAID_ENV || '(not set)',
          PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID ? '✓ set' : '✗ missing',
          PLAID_REDIRECT_URI: process.env.PLAID_REDIRECT_URI || '(not set — using default)',
        },
        blobsLoaded: !!blobsGetStore,
        useBlobStore,
        blobsWriteReadTest: writeReadTest,
        tokenCount: tokens.length,
        tokenInstitutions: tokens.map(t => t.institution || '(unknown)'),
      }, null, 2),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, stack: err.stack }),
    }
  }
}
