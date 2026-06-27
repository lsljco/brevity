// netlify/functions/plaid-create-link-token.js
// Creates a short-lived link_token for Plaid Link initialization.
// The link_token is safe to expose to the browser — it's single-use and expires in 30 minutes.

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
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'lslj-family-hub-user' },
      client_name: 'LSLJ Family Hub',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    })

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ link_token: response.data.link_token }),
    }
  } catch (err) {
    console.error('Plaid link token error:', err.response?.data || err.message)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to create link token', detail: err.message }),
    }
  }
}
