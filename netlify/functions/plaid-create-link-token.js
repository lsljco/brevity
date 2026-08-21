const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid')
const { readSession } = require('./household-auth')

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  })
)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    const session = await readSession(event)
    if (!session) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sign in to connect a bank.' }) }
    if (session.role !== 'admin') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Household administrator access is required to connect a bank.' }) }
    // access_token present = update mode (re-authenticate existing item)
    const body = event.body ? JSON.parse(event.body) : {}
    const { access_token } = body

    const params = {
      user: { client_user_id: 'lslj-family-hub-user' },
      client_name: 'LSLJ Family Hub',
      country_codes: [CountryCode.Us],
      language: 'en',
      // redirect_uri required for OAuth banks (e.g. Pinnacle).
      // Only set when PLAID_REDIRECT_URI env var is configured AND registered
      // in Plaid Dashboard → Team Settings → API → Allowed redirect URIs.
      // Omitting it allows non-OAuth banks to connect without errors.
      ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
    }

    if (access_token) {
      // Update mode: re-authenticate an existing item without creating a new one
      params.access_token = access_token
    } else {
      // New connection
      params.products = [Products.Transactions]
    }

    const response = await plaidClient.linkTokenCreate(params)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ link_token: response.data.link_token }),
    }
  } catch (err) {
    const plaidError = err.response?.data || null
    console.error('Plaid link token error:', plaidError || err.message)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to create link token',
        detail: plaidError?.error_message || 'Plaid could not start the secure bank connection. Review the server logs and Plaid configuration.',
        code: plaidError?.error_code || 'PLAID_LINK_ERROR',
      }),
    }
  }
}
