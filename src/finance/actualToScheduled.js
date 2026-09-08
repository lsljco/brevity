import { toISO } from './projection.js'
import { isRecognizedIncomeTransaction, isTransferTransaction } from './reportingData.js'

export function actualToScheduledTransaction(actual, localAccountId, id = `scheduled_${Date.now()}`) {
  if (isTransferTransaction(actual)) throw new Error('Account transfers cannot become income or expense plans.')
  if (Number(actual?.amount) < 0 && !isRecognizedIncomeTransaction(actual)) {
    throw new Error('Refunds and other credits cannot become expected-income plans.')
  }
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
