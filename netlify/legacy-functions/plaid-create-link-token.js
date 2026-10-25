const { readSession } = require('../lib/household-auth.cjs')
const { getTokens } = require('./storage')
const scopedStore = require('../lib/scoped-store.cjs')
let nativePlaid
exports.setNativePlaid = value => { nativePlaid = value }
const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store' }
const reply = (statusCode, body) => ({statusCode, headers, body:JSON.stringify(body)})

// Update mode only: no token exchange, new Item, roster write, or paid refresh.
exports.handler = async event => {
  if (!['GET','POST'].includes(event.httpMethod)) return reply(405,{error:'Method not allowed.'})
  try {
    const session = await readSession(event)
    if (!session) return reply(401,{error:'Sign in to view bank connection status.'})
    if (scopedStore.preview) return reply(403,{error:'Bank reconnection is unavailable in deploy previews.'})
    if (event.httpMethod === 'POST') {
      if (session.role !== 'admin') return reply(403,{error:'A household administrator must reconnect this bank.'})
      const requestHeaders = Object.fromEntries(Object.entries(event.headers || {}).map(([key,value])=>[key.toLowerCase(),value]))
      if (!String(requestHeaders['content-type'] || '').startsWith('application/json')) return reply(415,{error:'JSON required.'})
      const origin = requestHeaders.origin
      if (!origin || new URL(origin).host !== requestHeaders.host) return reply(403,{error:'Open reconnection from Brevity.'})
    }
    const tokens = await getTokens(event) || []
    const {Configuration,PlaidApi,PlaidEnvironments} = nativePlaid || require('plaid')
    const client = new PlaidApi(new Configuration({basePath:PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],baseOptions:{headers:{'PLAID-CLIENT-ID':process.env.PLAID_CLIENT_ID,'PLAID-SECRET':process.env.PLAID_SECRET}}}))
    if (event.httpMethod === 'GET') {
      const connections = await Promise.all(tokens.map(async token => {
        let code = '', verified = false
        try {
          const result = await client.itemGet({access_token:token.access_token},{timeout:8000})
          code = result.data.item?.error?.error_code || ''
          verified = true
        } catch (error) { code = error.response?.data?.error_code || 'STATUS_UNAVAILABLE' }
        return {item_id:token.item_id,institution:token.institution || 'Connected bank',code,verified}
      }))
      return reply(200,{connections,canReconnect:session.role === 'admin'})
    }
    let body
    try { body = JSON.parse(event.body || '{}') } catch { return reply(400,{error:'Invalid request.'}) }
    const token = tokens.find(item=>item.item_id === body.itemId)
    if (!token) return reply(404,{error:'Existing bank connection not found.'})
    const result = await client.linkTokenCreate({
      user:{client_user_id:session.member}, client_name:'Brevity', language:'en', country_codes:['US'],
      access_token:token.access_token,
      ...(process.env.PLAID_REDIRECT_URI ? {redirect_uri:process.env.PLAID_REDIRECT_URI} : {}),
    },{timeout:15000})
    return reply(200,{link_token:result.data.link_token})
  } catch {
    return reply(502,{error:'Secure bank reconnection is temporarily unavailable. Your saved accounts remain unchanged.'})
  }
}
