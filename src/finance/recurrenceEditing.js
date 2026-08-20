import { addDays, parseISODate, toISO } from './projection.js'

const cleanOccurrenceFields = transaction => {
  const { _occurrenceDate, _fromActual, ...clean } = transaction
  return clean
}

const previousDate = date => {
  const parsed = parseISODate(date)
  return parsed ? toISO(addDays(parsed, -1)) : date
}

export function editRecurringOccurrence(original, updated, occurrenceDate, scope, createId) {
  const base = cleanOccurrenceFields(original)
  const changes = cleanOccurrenceFields(updated)

  if (base.freq === 'once') return { upserts: [{ ...base, ...changes }], deleteIds: [] }

  if (scope === 'one') {
    return {
      upserts: [
        { ...base, skips: [...new Set([...(base.skips || []), occurrenceDate])] },
        { ...base, ...changes, id: createId(), freq: 'once', start: occurrenceDate, end: occurrenceDate, skips: [] },
      ],
      deleteIds: [],
    }
  }

  const future = {
    ...base,
    ...changes,
    id: createId(),
    start: occurrenceDate,
    skips: (changes.skips || base.skips || []).filter(date => date >= occurrenceDate),
  }
  if (future.end && future.end < occurrenceDate) future.end = ''

  if (occurrenceDate <= base.start) return { upserts: [future], deleteIds: [base.id] }
  return {
    upserts: [
      { ...base, end: previousDate(occurrenceDate), skips: (base.skips || []).filter(date => date < occurrenceDate) },
      future,
    ],
    deleteIds: [],
  }
}

export function deleteRecurringOccurrence(original, occurrenceDate, scope) {
  const base = cleanOccurrenceFields(original)
  if (base.freq === 'once') return { upserts: [], deleteIds: [base.id] }

  if (scope === 'one') {
    return {
      upserts: [{ ...base, skips: [...new Set([...(base.skips || []), occurrenceDate])] }],
      deleteIds: [],
    }
  }

  if (occurrenceDate <= base.start) return { upserts: [], deleteIds: [base.id] }
  return {
    upserts: [{ ...base, end: previousDate(occurrenceDate), skips: (base.skips || []).filter(date => date < occurrenceDate) }],
    deleteIds: [],
  }
}
