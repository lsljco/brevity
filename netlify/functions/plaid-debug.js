// plaid-debug.js — surfaces Plaid/Blobs status to the browser for diagnosis
const { getTokens, setTokens } = require('./storage')

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
    // Read existing tokens
    const tokens = await getTokens()

    // Test write + read cycle with a canary value
    let writeReadTest = 'not run'
    if (blobsGetStore) {
      try {
        const store = blobsGetStore({ name: 'plaid-tokens', consistency: 'strong' })
        const canary = { _test: true, ts: Date.now() }
        await store.setJSON('_debug_canary', canary)
        const back = await store.get('_debug_canary', { type: 'json' })
        writeReadTest = back?._test === true ? 'PASS' : `FAIL — got ${JSON.stringify(back)}`
        // Clean up
        await store.delete('_debug_canary')
      } catch (e) {
        writeReadTest = `ERROR: ${e.message}`
      }
    } else {
      writeReadTest = 'skipped — @netlify/blobs not loaded'
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        env: {
          NETLIFY: process.env.NETLIFY || '(not set)',
          NETLIFY_DEV: process.env.NETLIFY_DEV || '(not set)',
          NETLIFY_SITE_ID: process.env.NETLIFY_SITE_ID ? '✓ set' : '✗ missing',
          PLAID_ENV: process.env.PLAID_ENV || '(not set)',
          PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID ? '✓ set' : '✗ missing',
          PLAID_SECRET: process.env.PLAID_SECRET ? '✓ set' : '✗ missing',
          PLAID_REDIRECT_URI: process.env.PLAID_REDIRECT_URI || '(not set — using default)',
        },
        blobsLoaded: !!blobsGetStore,
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
