const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid')
const { getTokens } = require('./storage')

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

  try {
    const tokens = await getTokens()
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ accounts: [], connected: false }) }
    }

    const allAccounts = []
    const requiresUpdate = []  // items whose bank session has expired

    for (const { access_token, item_id, institution } of tokens) {
      try {
        const res = await plaidClient.accountsBalanceGet({ access_token })
        res.data.accounts.forEach(a => allAccounts.push({
          accountId: a.account_id, itemId: item_id,
          name: a.name, officialName: a.official_name,
          type: a.type, subtype: a.subtype,
          balance: a.balances.available ?? a.balances.current, availableBalance: a.balances.current,
          institution,
        }))
      } catch (err) {
        const code = err.response?.data?.error_code
        console.error(`Error for item ${item_id}:`, err.response?.data || err.message)
        // ITEM_LOGIN_REQUIRED means the user needs to re-authenticate with their bank
        if (code === 'ITEM_LOGIN_REQUIRED' || code === 'ITEM_LOCKED' || code === 'ITEM_NOT_SUPPORTED') {
          requiresUpdate.push({ item_id, institution })
        }
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        accounts: allAccounts,
        connected: true,
        requiresUpdate,  // non-empty = show "Re-connect [bank]" prompt
        syncedAt: new Date().toISOString(),
      }),
    }
  } catch (err) {
    console.error('Plaid accounts error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch accounts', detail: err.message }) }
  }
}
