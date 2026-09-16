import test from 'node:test'
import assert from 'node:assert/strict'
import { categoriesFromTransactions, CUSTOM_CATEGORY_STORAGE_KEY, loadStoredCategoryOptions, mergeCategoryOptions, saveStoredCategoryOptions, transactionCategories } from './categoryData.js'

function memoryStorage(values = {}) {
  const records = new Map(Object.entries(values))
  return {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
  }
}

test('keeps freehand categories and removes blank or case-insensitive duplicates', () => {
  assert.deepEqual(
    mergeCategoryOptions(['Housing', '  Tithes  '], ['tithes', '', null, 'Pet Care']),
    ['Housing', 'Tithes', 'Pet Care'],
  )
})

test('finds custom categories on transactions and their splits', () => {
  const transaction = {
    category: 'Business Supplies',
    splits: [{ cat: 'Client Meals' }, { category: 'Mileage' }],
  }

  assert.deepEqual(transactionCategories(transaction), ['Business Supplies', 'Client Meals', 'Mileage'])
  assert.deepEqual(categoriesFromTransactions([transaction, { cat: 'Tithes' }]), [
    'Business Supplies', 'Client Meals', 'Mileage', 'Tithes',
  ])
})

test('persists custom categories and restores categories already used by transactions', () => {
  const storage = memoryStorage({
    lslj_finance_v9: JSON.stringify({ transactions: [{ cat: 'Construction Materials' }] }),
    lslj_tx_overrides_v1: JSON.stringify({ bank1: { category: 'Tithes' } }),
  })

  assert.equal(saveStoredCategoryOptions(storage, ['Pet Care', ' pet care ']), true)
  assert.equal(storage.getItem(CUSTOM_CATEGORY_STORAGE_KEY), JSON.stringify(['Pet Care']))
  assert.deepEqual(loadStoredCategoryOptions(storage), ['Pet Care', 'Construction Materials', 'Tithes'])
})
