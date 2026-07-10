// plaid-debug.js — surfaces Plaid/Blobs status to the browser for diagnosis
// Remove or protect this endpoint once the connection is stable
const { getTokens, isNetlify, hasBlobsModule } = require('./storage')

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  try {
    const tokens = await getTokens()
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        isNetlify,
        hasBlobsModule,
        NETLIFY_SITE_ID: process.env.NETLIFY_SITE_ID ? '✓ set' : '✗ missing',
        NETLIFY_BLOBS_CONTEXT: process.env.NETLIFY_BLOBS_CONTEXT ? '✓ set' : '✗ missing',
        PLAID_ENV: process.env.PLAID_ENV || '(not set — defaults to sandbox)',
        PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID ? '✓ set' : '✗ missing',
        PLAID_SECRET: process.env.PLAID_SECRET ? '✓ set' : '✗ missing',
        tokenCount: tokens.length,
        tokenInstitutions: tokens.map(t => t.institution || '(unknown)'),
      }, null, 2),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
