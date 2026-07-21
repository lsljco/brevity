const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid')

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
    // access_token present = update mode (re-authenticate existing item)
    const body = event.body ? JSON.parse(event.body) : {}
    const { access_token } = body

    const params = {
      user: { client_user_id: 'lslj-family-hub-user' },
      client_name: 'LSLJ Family Hub',
      country_codes: [CountryCode.Us],
      language: 'en',
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
        detail: err.message,
        plaid_error: plaidError,
        env: process.env.PLAID_ENV || '(not set)',
        has_client_id: !!process.env.PLAID_CLIENT_ID,
        has_secret: !!process.env.PLAID_SECRET,
      }),
    }
  }
}
