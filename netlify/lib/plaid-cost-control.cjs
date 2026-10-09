const crypto = require('node:crypto')
const { getStore, connectLambda } = require('./scoped-store.cjs')

// Conservative reservations, not an invoice. Rates come from September 2026's
// household invoice. Failed/uncertain calls retain their reservation.
const MONTHLY_LIMIT_CENTS = 500
const COOLDOWN_MS = 6 * 60 * 60 * 1000
const RATES = { balance:10, transactions:12 }
const failure = (message, code, statusCode = 429) => Object.assign(new Error(message), { code, statusCode })

function uniqueConnections(tokens) {
  const items = new Set(), accessTokens = new Set()
  return tokens.filter(token => {
    if (!token.access_token || (token.item_id && items.has(token.item_id)) || accessTokens.has(token.access_token)) return false
    if (token.item_id) items.add(token.item_id)
    accessTokens.add(token.access_token)
    return true
  })
}

function costStore(event) {
  if (event?.blobs) connectLambda(event)
  const options = { name:'brevity-plaid-cost-control', consistency:'strong' }
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_TOKEN) {
    Object.assign(options, { siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
  }
  return getStore(options)
}

async function reservePaidCalls({ event, session, product, tokens, now = Date.now(), store }) {
  if (session?.role !== 'admin') throw failure('Only a household administrator can request paid bank updates.', 'PLAID_PAID_FORBIDDEN', 403)
  if (!RATES[product]) throw failure('Unknown paid bank update.', 'PLAID_COST_UNAVAILABLE', 503)
  const connections = uniqueConnections(tokens)
  const cost = connections.length * RATES[product]
  if (!cost) return { reservedCents:0 }
  const month = new Date(now).toISOString().slice(0, 7) // Plaid billing uses UTC months.
  const ids = connections.map(token => `${product}:${crypto.createHash('sha256').update(token.item_id || token.access_token).digest('hex')}`)
  try {
    const dataStore = store || costStore(event)
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const entry = await dataStore.getWithMetadata('household', { type:'json', consistency:'strong' })
      if (entry && (!entry.etag || !entry.data || !Number.isSafeInteger(entry.data.reservedCents) || !entry.data.lastAttempts)) throw new Error('Invalid cost ledger')
      const prior = entry?.data || { month, reservedCents:0, lastAttempts:{} }
      const used = prior.month === month ? prior.reservedCents : 0
      const nextAllowed = Math.max(0, ...ids.map(id => Number(prior.lastAttempts[id] || 0) + COOLDOWN_MS))
      if (nextAllowed > now) throw failure(`A paid ${product === 'balance' ? 'balance check' : 'transaction refresh'} was already requested for this connection. Try after ${new Date(nextAllowed).toISOString()}. Normal sync remains available.`, 'PLAID_PAID_COOLDOWN')
      if (used + cost > MONTHLY_LIMIT_CENTS) throw failure('The household’s $5 monthly estimated paid-refresh allowance has been reached. Normal transaction sync remains available; paid updates resume next month.', 'PLAID_PAID_BUDGET')
      const lastAttempts = Object.fromEntries(Object.entries(prior.lastAttempts).filter(([,time]) => Number(time) + COOLDOWN_MS > now))
      ids.forEach(id => { lastAttempts[id] = now })
      try {
        const result = await dataStore.setJSON('household', { month, reservedCents:used + cost, lastAttempts }, entry ? { onlyIfMatch:entry.etag } : { onlyIfNew:true })
        if (result?.modified === true) return { reservedCents:cost, monthlyReservedCents:used + cost, monthlyLimitCents:MONTHLY_LIMIT_CENTS }
        if (result?.modified !== false) throw new Error('Reservation was not acknowledged')
      } catch (error) {
        if (![409, 412].includes(error.status || error.statusCode)) throw error
      }
    }
    throw new Error('Cost ledger is busy')
  } catch (error) {
    if (error.code?.startsWith('PLAID_PAID_')) throw error
    // No ephemeral or browser-local fallback: a missing ledger must stop spend.
    throw failure('Paid bank updates are paused because the shared cost limit could not be verified. Normal sync remains available.', 'PLAID_COST_UNAVAILABLE', 503)
  }
}

module.exports = { reservePaidCalls, uniqueConnections, MONTHLY_LIMIT_CENTS, COOLDOWN_MS }
