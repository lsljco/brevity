const crypto = require('node:crypto')

const RECEIPT_VERSION = 2
const RECEIPT_TTL_MS = 10 * 60 * 1000
const MAX_ACCOUNTS = 100
const MAX_SOURCE_TEXT_LENGTH = 512
// A JSON string can expand one UTF-16 code unit to the six ASCII bytes used by
// a `\u0000` escape. This ceiling therefore covers the complete validated
// schema at its 100-account/string boundaries (about 3.31M base64url chars),
// while keeping receipt verification behind an explicit finite input bound.
const MAX_RECEIPT_PAYLOAD_LENGTH = 3_500_000
const SOURCE_TEXT_FIELDS = ['itemId','name','officialName','type','subtype','mask','institution']
const SOURCE_ACCOUNT_FIELDS = new Set(['accountId','balance','availableBalance','currentBalance', ...SOURCE_TEXT_FIELDS])
const LIVE_BALANCE_MODE = 'live'
const LIVE_BALANCE_PROVENANCE = 'plaid.accountsBalanceGet'

const secret = () => process.env.BREVITY_SOURCE_RECEIPT_KEY || process.env.BREVITY_AUTOMATION_KEY || ''
const householdId = () => process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const normalizedName = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function compatibleAccountType(localAccount, plaidAccount) {
  const localType = String(localAccount?.type || '').toLowerCase()
  const plaidType = String(plaidAccount?.type || '').toLowerCase()
  const plaidSubtype = String(plaidAccount?.subtype || '').toLowerCase()
  if (localType === 'checking') return plaidType === 'depository' && plaidSubtype === 'checking'
  if (localType === 'savings') return plaidType === 'depository' && plaidSubtype === 'savings'
  if (localType === 'credit') return plaidType === 'credit'
  if (localType === 'investment') return plaidType === 'investment'
  return false
}

function normalizePlaidAccountBalances(account) {
  const currentBalance = account?.balances?.current
  const availableBalance = account?.balances?.available
  const balance = account?.type === 'credit'
    ? (Number.isFinite(currentBalance) ? -currentBalance : NaN)
    : account?.type === 'investment'
      ? currentBalance
      : (availableBalance ?? currentBalance)
  if (!Number.isFinite(balance)) throw sourceError('Plaid returned an account without a usable balance.', 'PLAID_ACCOUNT_BALANCE_INVALID')
  return { balance, currentBalance, availableBalance }
}

function validateSourceAccounts(accounts) {
  if (!Array.isArray(accounts) || accounts.length > MAX_ACCOUNTS) throw sourceError('The Plaid account snapshot is invalid.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
  const ids = new Set()
  for (const account of accounts) {
    const prototype = account && typeof account === 'object' ? Object.getPrototypeOf(account) : undefined
    if (!account || typeof account !== 'object' || Array.isArray(account) || (prototype !== Object.prototype && prototype !== null) || Object.keys(account).some(field => !SOURCE_ACCOUNT_FIELDS.has(field))) {
      throw sourceError('The Plaid account snapshot contains unsupported source metadata.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
    }
    const accountId = account.accountId
    if (typeof accountId !== 'string' || !accountId || accountId.length > MAX_SOURCE_TEXT_LENGTH || ids.has(accountId)) throw sourceError('The Plaid account snapshot contains an invalid source identity.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
    ids.add(accountId)
    if (!Number.isFinite(account.balance) || Math.abs(account.balance) > 1_000_000_000_000) throw sourceError('The Plaid account snapshot contains an invalid balance.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
    if (account.availableBalance !== undefined && account.availableBalance !== null && (!Number.isFinite(account.availableBalance) || Math.abs(account.availableBalance) > 1_000_000_000_000)) {
      throw sourceError('The Plaid account snapshot contains an invalid available balance.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
    }
    if (account.currentBalance !== undefined && account.currentBalance !== null && (!Number.isFinite(account.currentBalance) || Math.abs(account.currentBalance) > 1_000_000_000_000)) {
      throw sourceError('The Plaid account snapshot contains an invalid current balance.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
    }
    for (const field of SOURCE_TEXT_FIELDS) {
      if (account[field] !== undefined && account[field] !== null && (typeof account[field] !== 'string' || account[field].length > MAX_SOURCE_TEXT_LENGTH)) {
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
  if (typeof receiptHouseholdId !== 'string' || !receiptHouseholdId || receiptHouseholdId.length > MAX_SOURCE_TEXT_LENGTH) {
    throw sourceError('The Plaid account source receipt has an invalid household identity.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
  }
  const issuedAt = now().getTime()
  if (!Number.isFinite(issuedAt)) throw sourceError('The Plaid account source receipt has an invalid issue time.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
  const payload = Buffer.from(JSON.stringify({
    version:RECEIPT_VERSION,
    householdId:receiptHouseholdId,
    issuedAt,
    expiresAt:issuedAt + RECEIPT_TTL_MS,
    balanceMode:LIVE_BALANCE_MODE,
    balanceProvenance:LIVE_BALANCE_PROVENANCE,
    accounts,
  })).toString('base64url')
  if (payload.length > MAX_RECEIPT_PAYLOAD_LENGTH) throw sourceError('The Plaid account source receipt exceeds its bounded schema.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
  return { payload, signature:sign(payload, signingSecret) }
}

function verifyAccountSourceReceipt(receipt, {
  now = () => new Date(),
  signingSecret = secret(),
  receiptHouseholdId = householdId(),
} = {}) {
  const payload = String(receipt?.payload || '')
  const signature = String(receipt?.signature || '')
  if (!payload || payload.length > MAX_RECEIPT_PAYLOAD_LENGTH || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[a-f0-9]{64}$/.test(signature)) throw sourceError('The Plaid account source receipt is missing or malformed.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
  if (typeof receiptHouseholdId !== 'string' || !receiptHouseholdId || receiptHouseholdId.length > MAX_SOURCE_TEXT_LENGTH) throw sourceError('The Plaid account source receipt has an invalid household identity.', 'PLAID_ACCOUNT_RECEIPT_INVALID')
  const expected = sign(payload, signingSecret)
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw sourceError('The Plaid account source receipt signature is invalid.', 'PLAID_ACCOUNT_RECEIPT_MISMATCH')
  let decoded
  try { decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) }
  catch { throw sourceError('The Plaid account source receipt payload is damaged.', 'PLAID_ACCOUNT_RECEIPT_INVALID') }
  const current = now().getTime()
  if (decoded?.version !== RECEIPT_VERSION || decoded?.householdId !== receiptHouseholdId || decoded?.balanceMode !== LIVE_BALANCE_MODE || decoded?.balanceProvenance !== LIVE_BALANCE_PROVENANCE || !Number.isFinite(decoded?.issuedAt) || !Number.isFinite(decoded?.expiresAt) || decoded.expiresAt <= current || decoded.issuedAt > current + 60_000 || decoded.expiresAt - decoded.issuedAt !== RECEIPT_TTL_MS) {
    throw sourceError('The Plaid account source receipt is expired or belongs to a different household.', 'PLAID_ACCOUNT_RECEIPT_MISMATCH')
  }
  return {
    accounts:validateSourceAccounts(decoded.accounts),
    issuedAt:decoded.issuedAt,
    receiptId:crypto.createHash('sha256').update(`${payload}.${signature}`).digest('hex'),
    balanceMode:decoded.balanceMode,
    balanceProvenance:decoded.balanceProvenance,
  }
}

function mergeVerifiedPlaidBalances(financeData, plaidAccounts = []) {
  if (!financeData?.accounts?.length || !plaidAccounts.length) return financeData
  validateSourceAccounts(plaidAccounts)
  const localIds = new Set()
  for (const account of financeData.accounts) {
    if (!account?.id || localIds.has(account.id)) throw sourceError('The finance plan contains a missing or duplicate account identity. No balances were changed.', 'PLAID_ACCOUNT_LINKAGE_AMBIGUOUS')
    localIds.add(account.id)
  }
  const localPlaidIdCounts = new Map()
  financeData.accounts.forEach(account => {
    if (!account?.plaidAccountId) return
    localPlaidIdCounts.set(account.plaidAccountId, (localPlaidIdCounts.get(account.plaidAccountId) || 0) + 1)
  })
  if ([...localPlaidIdCounts].some(([, count]) => count > 1)) {
    throw sourceError('The finance plan contains an ambiguous Plaid account link. No balances were changed.', 'PLAID_ACCOUNT_LINKAGE_AMBIGUOUS')
  }
  const matchedPlaidIds = new Set()
  const accounts = financeData.accounts.map(account => ({ ...account }))
  const link = (account, match) => {
    if (!match?.accountId || matchedPlaidIds.has(match.accountId)) return false
    if (!compatibleAccountType(account, match)) {
      throw sourceError('A linked Plaid account has a different financial type than its Brevity account. No balances were changed.', 'PLAID_ACCOUNT_LINKAGE_INCOMPATIBLE')
    }
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
    account.plaidCurrentBalance = Number.isFinite(match.currentBalance) ? match.currentBalance : undefined
    account.plaidAvailableBalance = Number.isFinite(match.availableBalance) ? match.availableBalance : undefined
    return true
  }
  accounts.forEach(account => link(account, plaidAccounts.find(item => item.accountId && item.accountId === account.plaidAccountId)))
  const nameEligible = accounts.filter(account => !account.plaidAccountId)
  const nameMatches = new Map(nameEligible.map(account => {
    const localName = normalizedName(account.name)
    const candidates = localName
      ? plaidAccounts.filter(item => !matchedPlaidIds.has(item.accountId) && compatibleAccountType(account, item) && normalizedName(item.name) === localName)
      : []
    return [account.id, candidates]
  }))
  const nameSourceCounts = new Map()
  nameMatches.forEach(matches => matches.forEach(match => nameSourceCounts.set(match.accountId, (nameSourceCounts.get(match.accountId) || 0) + 1)))
  nameEligible.forEach(account => {
    const candidates = nameMatches.get(account.id) || []
    if (candidates.length === 1 && nameSourceCounts.get(candidates[0].accountId) === 1) link(account, candidates[0])
  })
  return { ...financeData, accounts }
}

module.exports = {
  createAccountSourceReceipt,
  verifyAccountSourceReceipt,
  mergeVerifiedPlaidBalances,
  normalizePlaidAccountBalances,
  validateSourceAccounts,
  RECEIPT_TTL_MS,
  LIVE_BALANCE_MODE,
  LIVE_BALANCE_PROVENANCE,
}
