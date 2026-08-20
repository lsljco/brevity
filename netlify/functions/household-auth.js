const crypto = require('node:crypto')
const { getStore } = require('@netlify/blobs')

const MEMBERS = ['Larry', 'Lorenzo', 'Terica', 'Nyla', 'Javin', 'Isaiah']
const STORE_NAME = 'brevity-household-auth'
const SESSION_COOKIE = 'brevity_household_session'
const SESSION_DAYS = 30

function store() {
  return getStore({
    name: STORE_NAME,
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN,
  })
}

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders,
  },
  body: JSON.stringify(body),
})

const userKey = member => `users/${member.toLowerCase()}`

function parseCookies(event) {
  const raw = event.headers?.cookie || event.headers?.Cookie || ''
  return Object.fromEntries(raw.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf('=')
    return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]
  }))
}

async function sessionSecret() {
  const dataStore = store()
  let secret = await dataStore.get('session-secret', { type: 'text' }).catch(() => '')
  if (!secret) {
    secret = crypto.randomBytes(48).toString('hex')
    await dataStore.set('session-secret', secret)
  }
  return secret
}

function b64url(value) {
  return Buffer.from(value).toString('base64url')
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url')
}

async function createSession(member, role = 'member') {
  const payload = b64url(JSON.stringify({ member, role, exp: Date.now() + SESSION_DAYS * 86400000 }))
  const secret = await sessionSecret()
  return `${payload}.${sign(payload, secret)}`
}

async function readSession(event) {
  const token = parseCookies(event)[SESSION_COOKIE]
  if (!token || !token.includes('.')) return null
  const [payload, signature] = token.split('.')
  const secret = await sessionSecret()
  const expected = sign(payload, secret)
  if (signature.length !== expected.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!value.member || !MEMBERS.includes(value.member) || Number(value.exp) < Date.now()) return null
    return value
  } catch {
    return null
  }
}

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return { salt, hash }
}

function validPassword(password, record) {
  if (!record?.salt || !record?.hash) return false
  const actual = crypto.scryptSync(String(password), record.salt, 64)
  const expected = Buffer.from(record.hash, 'hex')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

async function configuredMembers() {
  const dataStore = store()
  const rows = await Promise.all(MEMBERS.map(async member => ({
    member,
    configured: Boolean(await dataStore.get(userKey(member), { type: 'json' }).catch(() => null)),
  })))
  return rows
}

async function anyUsers() {
  const rows = await configuredMembers()
  return rows.some(row => row.configured)
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`
}

function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
}

exports.handler = async event => {
  try {
    const action = event.queryStringParameters?.action || 'session'
    const dataStore = store()

    if (event.httpMethod === 'GET' && action === 'session') {
      const session = await readSession(event)
      return json(200, {
        authenticated: Boolean(session),
        member: session?.member || null,
        role: session?.role || null,
        bootstrapRequired: !(await anyUsers()),
      })
    }

    if (event.httpMethod === 'GET' && action === 'members') {
      const session = await readSession(event)
      if (!session) return json(401, { error: 'Sign in required.' })
      return json(200, { members: await configuredMembers(), role: session.role, member: session.member })
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })
    let body = {}
    try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'Invalid request.' }) }

    if (action === 'bootstrap') {
      if (await anyUsers()) return json(409, { error: 'Household accounts have already been initialized.' })
      if (body.member !== 'Larry') return json(400, { error: 'The first household administrator account must be Larry.' })
      if (String(body.password || '').length < 8) return json(400, { error: 'Use a password with at least 8 characters.' })
      const password = passwordHash(body.password)
      await dataStore.setJSON(userKey('Larry'), { member: 'Larry', role: 'admin', ...password, createdAt: new Date().toISOString() })
      const token = await createSession('Larry', 'admin')
      return json(201, { authenticated: true, member: 'Larry', role: 'admin' }, { 'set-cookie': sessionCookie(token) })
    }

    if (action === 'login') {
      const member = String(body.member || '')
      if (!MEMBERS.includes(member)) return json(400, { error: 'Choose a household member.' })
      const record = await dataStore.get(userKey(member), { type: 'json' }).catch(() => null)
      if (!record || !validPassword(body.password || '', record)) return json(401, { error: 'Incorrect member or password.' })
      const token = await createSession(member, record.role || 'member')
      return json(200, { authenticated: true, member, role: record.role || 'member' }, { 'set-cookie': sessionCookie(token) })
    }

    if (action === 'logout') return json(200, { ok: true }, { 'set-cookie': clearCookie() })

    if (action === 'set-member-password') {
      const session = await readSession(event)
      if (!session || session.role !== 'admin') return json(403, { error: 'Household administrator access required.' })
      const member = String(body.member || '')
      if (!MEMBERS.includes(member)) return json(400, { error: 'Unknown household member.' })
      if (String(body.password || '').length < 8) return json(400, { error: 'Use a password with at least 8 characters.' })
      const existing = await dataStore.get(userKey(member), { type: 'json' }).catch(() => null)
      const password = passwordHash(body.password)
      await dataStore.setJSON(userKey(member), {
        member,
        role: member === 'Larry' ? 'admin' : 'member',
        ...password,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      return json(200, { ok: true, member })
    }

    return json(404, { error: 'Unknown authentication action.' })
  } catch (error) {
    console.error('[household-auth]', error)
    return json(500, { error: 'Household sign-in is temporarily unavailable.' })
  }
}
