import { addDays, parseISODate, toISO, txOccursOnDate } from './projection.js'

const cleanOccurrenceFields = transaction => {
  const { _occurrenceDate, _fromActual, ...clean } = transaction
  return clean
}

const previousDate = date => {
  const parsed = parseISODate(date)
  return parsed ? toISO(addDays(parsed, -1)) : date
}

const assertReviewedOccurrence = (transaction, occurrenceDate, allowSeriesAnchor = false) => {
  const parsed = parseISODate(occurrenceDate)
  const isSeriesAnchor = allowSeriesAnchor && occurrenceDate === transaction.start
  if (!parsed || (!isSeriesAnchor && !txOccursOnDate(transaction, parsed))) {
    throw new Error('That reviewed occurrence is no longer part of this recurring series. Refresh and choose a current item.')
  }
}

export function editRecurringOccurrence(original, updated, occurrenceDate, scope, createId, destinationDate = occurrenceDate) {
  const base = cleanOccurrenceFields(original)
  const changes = cleanOccurrenceFields(updated)

  assertReviewedOccurrence(base, occurrenceDate, scope === 'future')

  if (destinationDate < occurrenceDate && scope === 'future') {
    throw new Error('A future series cannot begin before the occurrence where the reviewed change takes effect.')
  }

  if (base.freq === 'once') {
    const next = { ...base, ...changes, start:destinationDate }
    if (next.freq === 'once') next.end = destinationDate
    else if (!Object.hasOwn(changes, 'end') || changes.end === base.end) next.end = ''
    return { upserts: [next], deleteIds: [] }
  }

  if (scope === 'one') {
    return {
      upserts: [
        { ...base, skips: [...new Set([...(base.skips || []), occurrenceDate])] },
        { ...base, ...changes, id: createId(), freq: 'once', start: destinationDate, end: destinationDate, skips: [] },
      ],
      deleteIds: [],
    }
  }

  const future = {
    ...base,
    ...changes,
    id: createId(),
    start: destinationDate,
    skips: (changes.skips || base.skips || []).filter(date => date >= occurrenceDate),
  }
  if (future.freq === 'once') future.end = destinationDate
  else if (future.end && future.end < destinationDate) {
    throw new Error('The reviewed series end date cannot be before its new effective date.')
  }

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
  assertReviewedOccurrence(base, occurrenceDate, scope === 'future')
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
