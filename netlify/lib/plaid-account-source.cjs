const crypto = require('node:crypto')

const RECEIPT_VERSION = 1
const RECEIPT_TTL_MS = 10 * 60 * 1000
const MAX_ACCOUNTS = 100

const secret = () => process.env.BREVITY_SOURCE_RECEIPT_KEY || process.env.BREVITY_AUTOMATION_KEY || ''
const householdId = () => process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const normalizedName = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function compatibleAccountType(localAccount, plaidAccount) {
  const localType = String(localAccount?.type || '').toLowerCase()
  const plaidType = String(plaidAccount?.type || '').toLowerCase()
  const plaidSubtype = String(plaidAccount?.subtype || '').toLowerCase()
  if (localType === 'checking') return plaidSubtype === 'checking' || plaidType === 'depository'
  if (localType === 'savings') return plaidSubtype === 'savings'
  if (localType === 'credit') return plaidType === 'credit' || /credit card/.test(plaidSubtype)
  if (localType === 'investment') return plaidType === 'investment' || /brokerage|retirement/.test(plaidSubtype)
  return false
}

function validateSourceAccounts(accounts) {
  if (!Array.isArray(accounts) || accounts.length > MAX_ACCOUNTS) throw sourceError('The Plaid account snapshot is invalid.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
  const ids = new Set()
  for (const account of accounts) {
    const accountId = String(account?.accountId || '')
    if (!accountId || accountId.length > 512 || ids.has(accountId)) throw sourceError('The Plaid account snapshot contains an invalid source identity.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
    ids.add(accountId)
    if (!Number.isFinite(account.balance) || Math.abs(account.balance) > 1_000_000_000_000) throw sourceError('The Plaid account snapshot contains an invalid balance.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
    if (account.availableBalance !== undefined && account.availableBalance !== null && (!Number.isFinite(account.availableBalance) || Math.abs(account.availableBalance) > 1_000_000_000_000)) {
      throw sourceError('The Plaid account snapshot contains an invalid current balance.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
    }
    for (const field of ['itemId','name','officialName','type','subtype','mask','institution']) {
      if (account[field] !== undefined && account[field] !== null && (typeof account[field] !== 'string' || account[field].length > 512)) {
        throw sourceError('The Plaid account snapshot contains invalid source metadata.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
      }
    }
  }
  return accounts
}

function sourceError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

function sign(payload, signingSecret = secret()) {
  if (!signingSecret) throw sourceError('Plaid account source verification is not configured.', 'PLAID_ACCOUNT_RECEIPT_UNAVAILABLE')
  return crypto.createHmac('sha256', signingSecret).update(payload).digest('hex')
}

function createAccountSourceReceipt(accounts, {
  now = () => new Date(),
  signingSecret = secret(),
  receiptHouseholdId = householdId(),
} = {}) {
  validateSourceAccounts(accounts)
  const issuedAt = now().getTime()
  const payload = Buffer.from(JSON.stringify({
    version:RECEIPT_VERSION,
    householdId:receiptHouseholdId,
    issuedAt,
    expiresAt:issuedAt + RECEIPT_TTL_MS,
    accounts,
  })).toString('base64url')
  return { payload, signature:sign(payload, signingSecret) }
}

function verifyAccountSourceReceipt(receipt, {
  now = () => new Date(),
  signingSecret = secret(),
  receiptHouseholdId = householdId(),
} = {}) {
  const payload = String(receipt?.payload || '')
  const signature = String(receipt?.signature || '')
  if (!payload || payload.length > 250_000 || !/^[a-f0-9]{64}$/.test(signature)) throw sourceError('The Plaid account source receipt is missing or malformed.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
  const expected = sign(payload, signingSecret)
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw sourceError('The Plaid account source receipt signature is invalid.', 'PLAID_ACCOUNT_RECEIPT_MISMATCH')
  let decoded
  try { decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) }
  catch { throw sourceError('The Plaid account source receipt payload is damaged.', 'PLAID_ACCOUNT_RECEIPT_INVALID') }
  const current = now().getTime()
  if (decoded?.version !== RECEIPT_VERSION || decoded?.householdId !== receiptHouseholdId || !Number.isFinite(decoded?.issuedAt) || !Number.isFinite(decoded?.expiresAt) || decoded.expiresAt <= current || decoded.issuedAt > current + 60_000 || decoded.expiresAt - decoded.issuedAt !== RECEIPT_TTL_MS) {
    throw sourceError('The Plaid account source receipt is expired or belongs to a different household.', 'PLAID_ACCOUNT_RECEIPT_MISMATCH')
  }
  return validateSourceAccounts(decoded.accounts)
}

function mergeVerifiedPlaidBalances(financeData, plaidAccounts = []) {
  if (!financeData?.accounts?.length || !plaidAccounts.length) return financeData
  validateSourceAccounts(plaidAccounts)
  const matchedPlaidIds = new Set()
  const accounts = financeData.accounts.map(account => ({ ...account }))
  const link = (account, match) => {
    if (!match?.accountId) return false
    matchedPlaidIds.add(match.accountId)
    account.balance = match.balance
    account.plaidAccountId = match.accountId
    if (match.itemId) account.plaidItemId = match.itemId
    account.plaidName = match.name || ''
    account.plaidOfficialName = match.officialName || ''
    account.plaidType = match.type || ''
    account.plaidSubtype = match.subtype || ''
    account.institution = match.institution || ''
    account.mask = match.mask || ''
    account.plaidCurrentBalance = match.availableBalance
    return true
  }
  accounts.forEach(account => link(account, plaidAccounts.find(item => item.accountId && item.accountId === account.plaidAccountId)))
  accounts.filter(account => !matchedPlaidIds.has(account.plaidAccountId)).forEach(account => {
    const localName = normalizedName(account.name)
    if (!localName) return
    const compatible = plaidAccounts.filter(item => !matchedPlaidIds.has(item.accountId) && compatibleAccountType(account, item))
    let candidates = compatible.filter(item => normalizedName(item.name) === localName)
    if (!candidates.length) candidates = compatible.filter(item => {
      const plaidName = normalizedName(item.name)
      return localName.length >= 5 && plaidName.length >= 5 && (plaidName.includes(localName) || localName.includes(plaidName))
    })
    if (candidates.length === 1) link(account, candidates[0])
  })
  const unmatchedLocal = accounts.filter(account => !matchedPlaidIds.has(account.plaidAccountId))
  const unmatchedPlaid = plaidAccounts.filter(account => !matchedPlaidIds.has(account.accountId))
  if (unmatchedLocal.length === 1) {
    const candidates = unmatchedPlaid.filter(item => compatibleAccountType(unmatchedLocal[0], item))
    if (candidates.length === 1) link(unmatchedLocal[0], candidates[0])
  }
  return { ...financeData, accounts }
}

module.exports = {
  createAccountSourceReceipt,
  verifyAccountSourceReceipt,
  mergeVerifiedPlaidBalances,
  validateSourceAccounts,
  RECEIPT_TTL_MS,
}
