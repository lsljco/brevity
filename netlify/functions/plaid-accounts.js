const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid')
const { getTokens } = require('./storage')
const { readSession } = require('./household-auth')
const {
  createAccountSourceReceipt,
  normalizePlaidAccountBalances,
  LIVE_BALANCE_MODE,
  LIVE_BALANCE_PROVENANCE,
} = require('../lib/plaid-account-source.cjs')

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

  const params = new URLSearchParams(event.rawQuery || '')
  const liveBalance = params.get('live') === '1'

  try {
    const session = await readSession(event)
    if (!session) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sign in to view financial accounts.' }) }
    const tokens = await getTokens(event)
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ accounts: [], connected: false }) }
    }

    const allAccounts = []
    const requiresUpdate = []  // items whose bank session has expired
    const syncErrors = []

    for (const { access_token, item_id, institution } of tokens) {
      try {
        // Automatic application refreshes use Plaid's cached account endpoint,
        // which is fast and reliable. Only an explicit "Sync now" requests the
        // slower institution-facing live balance call.
        const res = liveBalance
          ? await plaidClient.accountsBalanceGet({ access_token })
          : await plaidClient.accountsGet({ access_token })
        const sourceAccounts = res.data.accounts.map(a => {
          // Assets stay positive, credit liabilities become negative, and
          // available credit never masquerades as spendable cash.
          const { balance, currentBalance, availableBalance } = normalizePlaidAccountBalances(a)
          return {
            accountId: a.account_id, itemId: item_id,
            name: a.name, officialName: a.official_name,
            type: a.type, subtype: a.subtype,
            mask: a.mask,
            balance, currentBalance, availableBalance,
            institution,
          }
        })
        allAccounts.push(...sourceAccounts)
      } catch (err) {
        const code = err.response?.data?.error_code
        console.error(`Error for item ${item_id}:`, err.response?.data || err.message)
        syncErrors.push({
          itemId: item_id,
          institution: institution || 'Connected institution',
          code: code || 'PLAID_SYNC_ERROR',
          message: code === 'ITEM_LOGIN_REQUIRED'
            ? 'This bank connection needs to be re-authenticated.'
            : 'This institution could not be refreshed.',
        })
        // ITEM_LOGIN_REQUIRED means the user needs to re-authenticate with their bank
        if (code === 'ITEM_LOGIN_REQUIRED' || code === 'ITEM_LOCKED' || code === 'ITEM_NOT_SUPPORTED') {
          requiresUpdate.push({ item_id, institution })
        }
      }
    }

    if (!allAccounts.length && syncErrors.length === tokens.length) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: 'Bank sync failed for every connected institution.',
          errors: syncErrors,
          requiresUpdate,
        }),
      }
    }

    const balanceMode = liveBalance ? LIVE_BALANCE_MODE : 'cached'
    const balanceProvenance = liveBalance ? LIVE_BALANCE_PROVENANCE : 'plaid.accountsGet'
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        accounts: allAccounts,
        // Cached accountsGet values describe connection/account metadata only.
        // Only the institution-facing live balance call can mint an importable
        // source receipt and advance durable household balance truth.
        ...(liveBalance ? { accountSourceReceipt:createAccountSourceReceipt(allAccounts) } : {}),
        connected: true,
        requiresUpdate,  // non-empty = show "Re-connect [bank]" prompt
        errors: syncErrors,
        syncedAt: new Date().toISOString(),
        balanceMode,
        balanceProvenance,
      }),
    }
  } catch (err) {
    console.error('Plaid accounts error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch accounts', detail: err.message }) }
  }
}
