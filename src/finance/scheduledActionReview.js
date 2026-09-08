const text = value => String(value ?? '').trim()
const amount = value => Number(value) || 0

function normalizedScheduledFields(transaction, effectiveDate) {
  const transactionType = text(transaction?.type) || 'expense'
  return {
    title:text(transaction?.name),
    amount:Math.abs(amount(transaction?.amount)),
    transactionType,
    frequency:text(transaction?.freq) || 'once',
    date:text(transaction?.start) || effectiveDate,
    endDate:text(transaction?.end),
    category:transactionType === 'transfer' ? 'Transfer' : text(transaction?.cat) || 'Other',
    accountId:text(transaction?.acct),
    transferAccountId:transactionType === 'transfer' ? text(transaction?.transferTo) : '',
    notes:text(transaction?.notes),
  }
}
/**
 * Translate the cash-plan editor's record shape into the explicit, reviewed
 * Action Mode fields. For updates, only changed fields are returned so the
 * confirmation screen never implies unrelated edits.
 */
export function buildScheduledActionPayload(transaction, { current = null, occurrenceDate = '' } = {}) {
  const targetDate = text(occurrenceDate || current?.start || transaction?.start)
  const desired = normalizedScheduledFields(transaction, targetDate)
  if (!current) return desired

  const baseline = normalizedScheduledFields(current, targetDate)
  baseline.date = targetDate
  return Object.fromEntries(Object.entries(desired).filter(([field, value]) => value !== baseline[field]))
}

export function scheduledActionScope(current, { occurrence = false, requestedScope = '' } = {}) {
  if (!current || current.freq === 'once') return { allowedScopes:['this-item'], defaultScope:'this-item' }
  if (requestedScope) {
    const selected = requestedScope === 'future' ? 'this-and-future' : 'this-item'
    return { allowedScopes:[selected], defaultScope:selected }
  }
  if (occurrence) return { allowedScopes:['this-item', 'this-and-future'], defaultScope:'this-item' }
  return { allowedScopes:['this-and-future'], defaultScope:'this-and-future' }
}
