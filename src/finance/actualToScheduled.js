import { toISO } from './projection.js'

export function actualToScheduledTransaction(actual, localAccountId, id = `scheduled_${Date.now()}`) {
  return {
    id,
    name: actual.name || actual.originalStatement || 'Recurring transaction',
    amount: String(Math.abs(Number(actual.amount) || 0)),
    type: Number(actual.amount) < 0 ? 'income' : 'expense',
    cat: actual.category || 'Other',
    acct: localAccountId || '',
    start: actual.date || toISO(new Date()),
    end: '',
    freq: 'monthly',
    dayOfWeek: '',
    dayOfMonth: '',
    skipDates: [],
    notes: actual.notes || '',
  }
}
