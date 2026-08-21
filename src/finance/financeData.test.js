import test from 'node:test'
import assert from 'node:assert/strict'
import { CALENDAR_DATA_VERSION, financeBackupKey, loadFinanceData, migrateFinanceData, saveFinanceData } from './financeData.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('migrates only exact legacy Thursday anchors and caps Shriner on August 14', () => {
  const original = {
    transactions: [
      { id: 't_i1', freq: 'weekly', start: '2026-07-02', end: '' },
      { id: 't_i3', freq: 'weekly', start: '2026-07-09', end: '' },
      { id: 'custom', freq: 'weekly', start: '2026-07-02', end: '' },
      { id: 't_i4', freq: 'weekly', start: '2026-07-17', end: '' },
    ],
  }

  const migrated = migrateFinanceData(original)

  assert.equal(migrated.calendarDataVersion, CALENDAR_DATA_VERSION)
  assert.deepEqual(migrated.transactions.map(tx => [tx.id, tx.start, tx.end]), [
    ['t_i1', '2026-07-03', '2026-08-14'],
    ['t_i3', '2026-07-10', ''],
    ['custom', '2026-07-02', ''],
    ['t_i4', '2026-07-17', ''],
  ])
  assert.equal(original.transactions[0].start, '2026-07-02')
})

test('does not reapply a completed calendar migration', () => {
  const data = {
    calendarDataVersion: CALENDAR_DATA_VERSION,
    transactions: [{ id: 't_i1', freq: 'weekly', start: '2026-07-02', end: '' }],
  }

  assert.equal(migrateFinanceData(data), data)
})

test('removes the cancelled legacy Ameripro income series once', () => {
  const data = {
    calendarDataVersion: 1,
    transactions: [
      { id: 't_i6', name: 'LJ - Ameripro Income', freq: 'weekly', start: '2026-07-03' },
      { id: 'custom', name: 'A user-created income', freq: 'weekly', start: '2026-07-03' },
    ],
  }

  const migrated = migrateFinanceData(data)
  assert.deepEqual(migrated.transactions.map(transaction => transaction.id), ['custom'])
  assert.equal(migrated.calendarDataVersion, CALENDAR_DATA_VERSION)
})

test('ends Mativ on September 18 and converts the saved CRH first check to weekly', () => {
  const data = {
    calendarDataVersion: 2,
    transactions: [
      { id: 't_i5', name: 'JS - Mativ Income', type: 'income', freq: 'weekly', start: '2026-07-03', end: '' },
      { id: 'new-job', name: 'JS CRH Oldcastle Income', type: 'income', freq: 'once', start: '2026-09-04', end: '', amount: 1234.56 },
    ],
  }

  const migrated = migrateFinanceData(data)

  assert.deepEqual(migrated.transactions, [
    { id: 't_i5', name: 'JS - Mativ Income', type: 'income', freq: 'weekly', start: '2026-07-03', end: '2026-09-18' },
    { id: 'new-job', name: 'JS CRH Oldcastle Income', type: 'income', freq: 'weekly', start: '2026-09-04', end: '', amount: 1234.56 },
  ])
})

test('repairs version 3 records that still contain Ameripro or monthly property taxes', () => {
  const data = {
    calendarDataVersion: 3,
    transactions: [
      { id: 't_i6', name: 'LJ - Ameripro Income', type: 'income', freq: 'weekly', start: '2026-07-03' },
      { id: 't_h6', name: 'Property Taxes', type: 'expense', freq: 'monthly', start: '2026-08-14', amount: 30337.59 },
      { id: 'custom-tax', name: 'Property Taxes', type: 'expense', freq: 'monthly', start: '2026-08-14', amount: 100 },
    ],
  }

  const migrated = migrateFinanceData(data)

  assert.equal(migrated.calendarDataVersion, CALENDAR_DATA_VERSION)
  assert.deepEqual(migrated.transactions, [
    { id: 't_h6', name: 'Property Taxes', type: 'expense', freq: 'yearly', start: '2026-08-14', amount: 30337.59 },
    { id: 'custom-tax', name: 'Property Taxes', type: 'expense', freq: 'monthly', start: '2026-08-14', amount: 100 },
  ])
})

test('reports browser storage failures instead of claiming a save succeeded', () => {
  const error = new Error('quota exceeded')
  const storage = { setItem() { throw error } }

  assert.deepEqual(saveFinanceData(storage, 'finance', { transactions: [] }), { ok: false, error })
})

test('round-trips every custom change through persistent storage', () => {
  const storage = memoryStorage()
  const changed = {
    calendarDataVersion: CALENDAR_DATA_VERSION,
    transactions: [{ id: 'custom', freq: 'weekly', start: '2026-08-14', end: '2026-09-04' }],
  }

  assert.equal(saveFinanceData(storage, 'finance', changed).ok, true)
  assert.deepEqual(loadFinanceData(storage, 'finance'), { data: changed, source: 'primary' })
})

test('recovers the latest saved data from backup if the primary record is damaged', () => {
  const storage = memoryStorage()
  const changed = { transactions: [{ id: 'kept-after-refresh', start: '2026-08-14' }] }
  saveFinanceData(storage, 'finance', changed)
  storage.setItem('finance', '{not valid json')

  const loaded = loadFinanceData(storage, 'finance')
  assert.deepEqual(loaded.data, changed)
  assert.equal(loaded.source, 'backup')
  assert.equal(storage.getItem(financeBackupKey('finance')), JSON.stringify(changed))
})
