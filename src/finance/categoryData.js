export const CUSTOM_CATEGORY_STORAGE_KEY = 'brevity_finance_categories_v1'

export const DEFAULT_TRANSACTION_CATEGORIES = [
  'Food & Drink', 'Groceries', 'Restaurants', 'Coffee',
  'Housing', 'Mortgage', 'Rent', 'HOA',
  'Utilities', 'Electric', 'Water', 'Gas', 'Internet', 'Phone',
  'Transport', 'Gas/Fuel', 'Parking', 'Rideshare',
  'Insurance', 'Health Insurance', 'Auto Insurance', 'Home Insurance',
  'Entertainment', 'Streaming', 'Movies', 'Sports', 'Subscriptions',
  'Healthcare', 'Doctor', 'Pharmacy', 'Dental',
  'Education', 'Tuition', 'Books',
  'Savings', 'Investment',
  'Shopping', 'Clothing', 'Electronics',
  'Travel', 'Hotels', 'Airlines',
  'Personal Care',
  'Transfer',
  'Income', 'Paycheck',
  'Fees',
  'Other',
]

export function mergeCategoryOptions(...groups) {
  const options = []
  const seen = new Set()

  groups.flat(Infinity).forEach(value => {
    const category = typeof value === 'string' ? value.trim() : ''
    const key = category.toLocaleLowerCase()
    if (!category || seen.has(key)) return
    seen.add(key)
    options.push(category)
  })

  return options
}

export function transactionCategories(transaction = {}) {
  return mergeCategoryOptions(
    transaction.category,
    transaction.cat,
    (transaction.splits || []).map(split => split?.category || split?.cat),
  )
}

export function categoriesFromTransactions(transactions = []) {
  return mergeCategoryOptions(transactions.map(transactionCategories))
}

function readJson(storage, key, fallback) {
  try {
    return JSON.parse(storage?.getItem(key) || 'null') ?? fallback
  } catch {
    return fallback
  }
}

export function loadStoredCategoryOptions(storage) {
  const financeData = readJson(storage, 'lslj_finance_v9', {})
  const actualOverrides = readJson(storage, 'lslj_tx_overrides_v1', {})

  return mergeCategoryOptions(
    readJson(storage, CUSTOM_CATEGORY_STORAGE_KEY, []),
    categoriesFromTransactions(financeData.transactions || []),
    categoriesFromTransactions(Object.values(actualOverrides)),
  )
}

export function saveStoredCategoryOptions(storage, categories) {
  try {
    storage?.setItem(CUSTOM_CATEGORY_STORAGE_KEY, JSON.stringify(mergeCategoryOptions(categories)))
    return true
  } catch {
    return false
  }
}
