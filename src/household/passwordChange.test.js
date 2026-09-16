import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const authPath = require.resolve('../../netlify/functions/household-auth.js')
const blobsPath = require.resolve('@netlify/blobs')

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({
  salt,
  hash:crypto.scryptSync(password, salt, 64).toString('hex'),
})
const sessionKey = token => `sessions/${crypto.createHash('sha256').update(token).digest('hex')}`

function installAuth(records) {
  const values = new Map(Object.entries(records))
  const dataStore = {
    get:async key => values.get(key) ?? null,
    set:async (key, value) => values.set(key, value),
    setJSON:async (key, value) => values.set(key, structuredClone(value)),
  }
  const previous = require.cache[blobsPath]
  try {
    require.cache[blobsPath] = { id:blobsPath, filename:blobsPath, loaded:true, exports:{ getStore:() => dataStore } }
    delete require.cache[authPath]
    return { handler:require(authPath).handler, values }
  } finally {
    delete require.cache[authPath]
    if (previous) require.cache[blobsPath] = previous
    else delete require.cache[blobsPath]
  }
}

const event = ({ token, action, body, method = 'POST' }) => ({
  httpMethod:method,
  queryStringParameters:{ action },
  headers:token ? { cookie:`brevity_household_session=v2.${token}` } : {},
  body:JSON.stringify(body || {}),
})

test('administrator can set a member password only after current-password verification', async () => {
  const adminToken = 'a'.repeat(64)
  const { handler, values } = installAuth({
    'users/larry':{ member:'Larry', role:'admin', authVersion:0, ...hashPassword('larry-current') },
    [sessionKey(adminToken)]:{ member:'Larry', role:'admin', authVersion:0, exp:Date.now() + 60_000 },
  })

  const rejected = await handler(event({ token:adminToken, action:'set-member-password', body:{ member:'Nyla', currentPassword:'wrong-password', newPassword:'nyla-new-password' } }))
  assert.equal(rejected.statusCode, 401)
  assert.equal(values.has('users/nyla'), false)

  const changed = await handler(event({ token:adminToken, action:'set-member-password', body:{ member:'Nyla', currentPassword:'larry-current', newPassword:'nyla-new-password' } }))
  assert.equal(changed.statusCode, 201)
  assert.equal(values.get('users/nyla').updatedBy, 'Larry')
  assert.equal(values.get('users/nyla').authVersion, 1)
  assert.equal(changed.headers['set-cookie'], undefined, 'changing another member must not replace the administrator session')

  const login = await handler(event({ action:'login', body:{ member:'Nyla', password:'nyla-new-password' } }))
  assert.equal(login.statusCode, 200)
  assert.match(login.headers['set-cookie'], /^brevity_household_session=v2\./)
})

test('changing your own password invalidates the old session and issues a replacement', async () => {
  const memberToken = 'b'.repeat(64)
  const { handler, values } = installAuth({
    'users/nyla':{ member:'Nyla', role:'member', authVersion:0, ...hashPassword('nyla-current') },
    [sessionKey(memberToken)]:{ member:'Nyla', role:'member', authVersion:0, exp:Date.now() + 60_000 },
  })

  const changed = await handler(event({ token:memberToken, action:'set-member-password', body:{ member:'Nyla', currentPassword:'nyla-current', newPassword:'nyla-replacement' } }))
  assert.equal(changed.statusCode, 200)
  assert.match(changed.headers['set-cookie'], /^brevity_household_session=v2\./)
  assert.equal(values.get('users/nyla').authVersion, 1)

  const oldSession = await handler(event({ token:memberToken, action:'session', method:'GET' }))
  assert.equal(JSON.parse(oldSession.body).authenticated, false)
})
