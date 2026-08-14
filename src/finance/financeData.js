export const CALENDAR_DATA_VERSION = 1
export const financeBackupKey = key => `${key}_backup`

// These weekly records were originally seeded on Thursdays even though they
// represent Friday activity. Only migrate the exact legacy anchors so a date
// the user has intentionally customized is never moved by a deployment.
const LEGACY_FRIDAY_ANCHORS = {
  t_i1: { from: '2026-07-02', to: '2026-07-03' },
  t_i3: { from: '2026-07-09', to: '2026-07-10' },
  t_i4: { from: '2026-07-02', to: '2026-07-03' },
  t_i5: { from: '2026-07-02', to: '2026-07-03' },
  t_i6: { from: '2026-07-02', to: '2026-07-03' },
  t_i7: { from: '2026-07-02', to: '2026-07-03' },
  t_t1: { from: '2026-07-02', to: '2026-07-03' },
  t_f1: { from: '2026-07-02', to: '2026-07-03' },
  t_disc1: { from: '2026-07-02', to: '2026-07-03' },
}

const SHRINER_ID = 't_i1'
const SHRINER_LAST_CHECK = '2026-08-14'

export function migrateFinanceData(data) {
  if (!data || typeof data !== 'object') return data
  if ((Number(data.calendarDataVersion) || 0) >= CALENDAR_DATA_VERSION) return data

  const transactions = Array.isArray(data.transactions)
    ? data.transactions.map(transaction => {
        const correction = LEGACY_FRIDAY_ANCHORS[transaction.id]
        let next = transaction

        if (correction && transaction.freq === 'weekly' && transaction.start === correction.from) {
          next = { ...next, start: correction.to }
        }

        // This income series has ended. Cap a missing or later legacy end date,
        // while preserving an earlier end date the user may have chosen.
        if (transaction.id === SHRINER_ID && (!transaction.end || transaction.end > SHRINER_LAST_CHECK)) {
          next = { ...next, end: SHRINER_LAST_CHECK }
        }

        return next
      })
    : data.transactions

  return {
    ...data,
    calendarDataVersion: CALENDAR_DATA_VERSION,
    transactions,
  }
}

export function saveFinanceData(storage, key, data) {
  try {
    const serialized = JSON.stringify(data)
    storage.setItem(key, serialized)

    // A second copy lets a future refresh recover from a damaged primary
    // record. The primary write is the durability requirement; a quota-limited
    // backup must not make an otherwise successful save look unsuccessful.
    let backupError = null
    try {
      storage.setItem(financeBackupKey(key), serialized)
    } catch (error) {
      backupError = error
    }

    return { ok: true, backupError }
  } catch (error) {
    return { ok: false, error }
  }
}

export function loadFinanceData(storage, key) {
  let primaryError = null

  try {
    const primary = storage.getItem(key)
    if (primary) return { data: JSON.parse(primary), source: 'primary' }
  } catch (error) {
    primaryError = error
  }

  try {
    const backup = storage.getItem(financeBackupKey(key))
    if (backup) return { data: JSON.parse(backup), source: 'backup', primaryError }
  } catch (backupError) {
    return { data: null, source: 'invalid', primaryError, backupError }
  }

  return { data: null, source: primaryError ? 'invalid' : 'empty', primaryError }
}
