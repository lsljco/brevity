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
    const { public_token, institutionName } = JSON.parse(event.body || '{}')
    if (!public_token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'public_token required' }) }

    const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token })
    const { access_token, item_id } = exchangeResponse.data

    const tokens = await getTokens()
    const updated = (tokens || []).filter(t => t.item_id !== item_id)
    updated.push({ access_token, item_id, institution: institutionName || 'Bank', connectedAt: new Date().toISOString() })
    await setTokens(updated)

    const accountsResponse = await plaidClient.accountsBalanceGet({ access_token })
    const accounts = accountsResponse.data.accounts.map(a => ({
      accountId: a.account_id, itemId: item_id,
      name: a.name, officialName: a.official_name,
      type: a.type, subtype: a.subtype,
     balance: a.balances.available ?? a.balances.current, availableBalance: a.balances.current,
      institution: institutionName || 'Bank',
    }))

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, accounts }) }
  } catch (err) {
    console.error('Plaid exchange error:', err.response?.data || err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Token exchange failed', detail: err.message }) }
  }
}
