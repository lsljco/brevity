const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid')
const { getTokens } = require('./storage')

const plaidClient = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: { headers: {
    'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
    'PLAID-SECRET': process.env.PLAID_SECRET,
  }},
}))

function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  const params = new URLSearchParams(event.rawQuery || '')
  const days = parseInt(params.get('days') || '30', 10)

  try {
    const tokens = await getTokens()
    if (!Array.isArray(tokens) || tokens.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ transactions: [] }) }

    const allTxns = []
    const startDate = daysAgo(days), endDate = new Date().toISOString().split('T')[0]

    for (const { access_token, institution } of tokens) {
      try {
        const res = await plaidClient.transactionsGet({ access_token, start_date: startDate, end_date: endDate, options: { count: 500 } })
        res.data.transactions.forEach(t => allTxns.push({
          id: t.transaction_id, accountId: t.account_id,
          name: t.merchant_name || t.name, amount: t.amount,
          date: t.date, category: t.personal_finance_category?.primary || t.category?.[0] || 'Other',
          type: t.amount > 0 ? 'expense' : 'income', institution, pending: t.pending,
        }))
      } catch (err) { console.error('Transactions error:', err.response?.data || err.message) }
    }

    allTxns.sort((a, b) => new Date(b.date) - new Date(a.date))
    return { statusCode: 200, headers, body: JSON.stringify({ transactions: allTxns, count: allTxns.length }) }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch transactions', detail: err.message }) }
  }
}
