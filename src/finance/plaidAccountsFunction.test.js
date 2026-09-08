import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const handlerPath = require.resolve('../../netlify/functions/plaid-accounts.js')
const plaidPath = require.resolve('plaid')
const storagePath = require.resolve('../../netlify/functions/storage.js')
const householdAuthPath = require.resolve('../../netlify/functions/household-auth.js')
const {
  LIVE_BALANCE_MODE,
  LIVE_BALANCE_PROVENANCE,
  verifyAccountSourceReceipt,
} = require('../../netlify/lib/plaid-account-source.cjs')

const checkingAccount = ({ id = 'checking-1', current = 1_250, available = 1_100 } = {}) => ({
  account_id:id,
  name:'Operating Account',
  official_name:'Household Operating Checking',
  type:'depository',
  subtype:'checking',
  mask:'1234',
  balances:{ current, available },
})

const creditAccount = ({ id = 'credit-1', current = 450, available = 3_550 } = {}) => ({
  account_id:id,
  name:'Household Card',
  official_name:'Household Rewards Credit Card',
  type:'credit',
  subtype:'credit card',
  mask:'9876',
  balances:{ current, available },
})

function installHandler({ client, tokens, session = { householdId:'household-test' } }) {
  const mockedModules = new Map([
    [plaidPath, {
      Configuration:class Configuration {},
      PlaidApi:class PlaidApi {
        constructor() { return client }
      },
      PlaidEnvironments:{ sandbox:'https://sandbox.plaid.test' },
    }],
    [storagePath, { getTokens:async () => tokens }],
    [householdAuthPath, { readSession:async () => session }],
  ])
  const priorEntries = new Map([...mockedModules].map(([path]) => [path, require.cache[path]]))

  try {
    for (const [path, exports] of mockedModules) {
      require.cache[path] = { id:path, filename:path, loaded:true, exports }
    }
    delete require.cache[handlerPath]
    return require(handlerPath).handler
  } finally {
    delete require.cache[handlerPath]
    for (const [path, prior] of priorEntries) {
      if (prior) require.cache[path] = prior
      else delete require.cache[path]
    }
  }
}

const request = rawQuery => ({ httpMethod:'GET', rawQuery, headers:{} })
const bodyOf = response => JSON.parse(response.body)

async function captureConsoleErrors(operation) {
  const original = console.error
  const errors = []
  console.error = (...args) => errors.push(args)
  try {
    return { result:await operation(), errors }
  } finally {
    console.error = original
  }
}

test('cached account metadata uses accountsGet and cannot mint an import receipt', async () => {
  const calls = []
  const client = {
    accountsGet:async requestBody => {
      calls.push(['cached', requestBody])
      return { data:{ accounts:[checkingAccount()] } }
    },
    accountsBalanceGet:async requestBody => {
      calls.push(['live', requestBody])
      throw new Error('The cached path must not request live balances.')
    },
  }
  const handler = installHandler({
    client,
    tokens:[{ access_token:'cached-token', item_id:'item-1', institution:'Test Bank' }],
  })

  const response = await handler(request(''))
  const body = bodyOf(response)

  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, [['cached', { access_token:'cached-token' }]])
  assert.equal(body.balanceMode, 'cached')
  assert.equal(body.balanceProvenance, 'plaid.accountsGet')
  assert.equal(Object.hasOwn(body, 'accountSourceReceipt'), false)
  assert.equal(body.accounts[0].balance, 1_100)
})

test('live=1 uses accountsBalanceGet and returns verifiable live provenance', async () => {
  const previousKey = process.env.BREVITY_SOURCE_RECEIPT_KEY
  process.env.BREVITY_SOURCE_RECEIPT_KEY = 'plaid-handler-test-signing-key'
  const calls = []
  const client = {
    accountsGet:async () => {
      throw new Error('The live path must not use cached account metadata.')
    },
    accountsBalanceGet:async requestBody => {
      calls.push(requestBody)
      return { data:{ accounts:[checkingAccount(), creditAccount()] } }
    },
  }
  const handler = installHandler({
    client,
    tokens:[{ access_token:'live-token', item_id:'item-live', institution:'Live Bank' }],
  })

  try {
    const response = await handler(request('live=1'))
    const body = bodyOf(response)
    const verified = verifyAccountSourceReceipt(body.accountSourceReceipt, {
      signingSecret:'plaid-handler-test-signing-key',
      receiptHouseholdId:process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family',
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(calls, [{ access_token:'live-token' }])
    assert.equal(body.balanceMode, LIVE_BALANCE_MODE)
    assert.equal(body.balanceProvenance, LIVE_BALANCE_PROVENANCE)
    assert.equal(verified.balanceMode, LIVE_BALANCE_MODE)
    assert.equal(verified.balanceProvenance, LIVE_BALANCE_PROVENANCE)
    assert.deepEqual(verified.accounts, body.accounts)
  } finally {
    if (previousKey === undefined) delete process.env.BREVITY_SOURCE_RECEIPT_KEY
    else process.env.BREVITY_SOURCE_RECEIPT_KEY = previousKey
  }
})

test('live balance normalization treats deposits as available cash and credit as a liability', async () => {
  const previousKey = process.env.BREVITY_SOURCE_RECEIPT_KEY
  process.env.BREVITY_SOURCE_RECEIPT_KEY = 'plaid-handler-normalization-key'
  const handler = installHandler({
    client:{
      accountsBalanceGet:async () => ({
        data:{ accounts:[
          checkingAccount({ current:1_250, available:1_100 }),
          creditAccount({ current:450, available:3_550 }),
        ] },
      }),
    },
    tokens:[{ access_token:'token', item_id:'item', institution:'Test Bank' }],
  })

  try {
    const body = bodyOf(await handler(request('live=1')))
    const checking = body.accounts.find(account => account.accountId === 'checking-1')
    const credit = body.accounts.find(account => account.accountId === 'credit-1')

    assert.deepEqual(
      { balance:checking.balance, current:checking.currentBalance, available:checking.availableBalance },
      { balance:1_100, current:1_250, available:1_100 },
    )
    assert.deepEqual(
      { balance:credit.balance, current:credit.currentBalance, available:credit.availableBalance },
      { balance:-450, current:450, available:3_550 },
    )
  } finally {
    if (previousKey === undefined) delete process.env.BREVITY_SOURCE_RECEIPT_KEY
    else process.env.BREVITY_SOURCE_RECEIPT_KEY = previousKey
  }
})

test('one institution can succeed while another reports a reauthentication failure', async () => {
  const previousKey = process.env.BREVITY_SOURCE_RECEIPT_KEY
  process.env.BREVITY_SOURCE_RECEIPT_KEY = 'plaid-handler-partial-key'
  const client = {
    accountsBalanceGet:async ({ access_token:accessToken }) => {
      if (accessToken === 'expired-token') {
        throw Object.assign(new Error('login required'), {
          response:{ data:{ error_code:'ITEM_LOGIN_REQUIRED' } },
        })
      }
      return { data:{ accounts:[checkingAccount({ id:'healthy-checking' })] } }
    },
  }
  const handler = installHandler({
    client,
    tokens:[
      { access_token:'healthy-token', item_id:'healthy-item', institution:'Healthy Bank' },
      { access_token:'expired-token', item_id:'expired-item', institution:'Expired Bank' },
    ],
  })

  try {
    const { result:response, errors:loggedErrors } = await captureConsoleErrors(() => handler(request('live=1')))
    const body = bodyOf(response)
    const verified = verifyAccountSourceReceipt(body.accountSourceReceipt, {
      signingSecret:'plaid-handler-partial-key',
      receiptHouseholdId:process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family',
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(body.accounts.map(account => account.accountId), ['healthy-checking'])
    assert.deepEqual(verified.accounts.map(account => account.accountId), ['healthy-checking'])
    assert.deepEqual(body.errors, [{
      itemId:'expired-item',
      institution:'Expired Bank',
      code:'ITEM_LOGIN_REQUIRED',
      message:'This bank connection needs to be re-authenticated.',
    }])
    assert.deepEqual(body.requiresUpdate, [{ item_id:'expired-item', institution:'Expired Bank' }])
    assert.equal(loggedErrors.length, 1)
  } finally {
    if (previousKey === undefined) delete process.env.BREVITY_SOURCE_RECEIPT_KEY
    else process.env.BREVITY_SOURCE_RECEIPT_KEY = previousKey
  }
})

test('failure at every connected institution returns a 502 without importable account data', async () => {
  const client = {
    accountsBalanceGet:async ({ access_token:accessToken }) => {
      throw Object.assign(new Error(`failure for ${accessToken}`), {
        response:{ data:{ error_code:accessToken === 'locked-token' ? 'ITEM_LOCKED' : 'INSTITUTION_DOWN' } },
      })
    },
  }
  const handler = installHandler({
    client,
    tokens:[
      { access_token:'locked-token', item_id:'locked-item', institution:'Locked Bank' },
      { access_token:'down-token', item_id:'down-item', institution:'Down Bank' },
    ],
  })

  const { result:response, errors:loggedErrors } = await captureConsoleErrors(() => handler(request('live=1')))
  const body = bodyOf(response)

  assert.equal(response.statusCode, 502)
  assert.equal(body.error, 'Bank sync failed for every connected institution.')
  assert.deepEqual(body.errors.map(error => error.code), ['ITEM_LOCKED', 'INSTITUTION_DOWN'])
  assert.deepEqual(body.requiresUpdate, [{ item_id:'locked-item', institution:'Locked Bank' }])
  assert.equal(Object.hasOwn(body, 'accounts'), false)
  assert.equal(Object.hasOwn(body, 'accountSourceReceipt'), false)
  assert.equal(loggedErrors.length, 2)
})
