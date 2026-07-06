const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid')
const { getTokens, setTokens } = require('./storage')

const plaidClient = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: { headers: {
    'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
    'PLAID-SECRET': process.env.PLAID_SECRET,
  }},
}))

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const { item_id } = JSON.parse(event.body || '{}')
    const tokens = await getTokens()
    const target = (tokens || []).find(t => t.item_id === item_id)
    if (target) {
      await plaidClient.itemRemove({ access_token: target.access_token }).catch(() => {})
      await setTokens(tokens.filter(t => t.item_id !== item_id))
    }
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
