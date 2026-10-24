// Read the same reconciled projection displayed by Cash Forecast. Never substitute
// scheduled income for cash already posted, or present missing evidence as zero.
export function financeOverviewModel({ accounts = [], projection = new Map(), today, live = false, transactionStatus = 'unknown', unmappedCount = 0, error = '' } = {}) {
  const finite = value => value !== '' && value != null && Number.isFinite(Number(value))
  const cashAccounts = accounts.filter(account => ['checking', 'savings'].includes(account.type))
  const storedCash = cashAccounts.length && cashAccounts.every(account => finite(account.balance))
    ? cashAccounts.reduce((sum, account) => sum + Number(account.balance), 0) : null
  const anchor = projection.get(today)?.anchorBalance
  const cash = storedCash === null ? null : finite(anchor) ? Number(anchor) : storedCash
  const date = new Date(`${today}T12:00:00`)
  const monthEndDate = `${today.slice(0, 7)}-${String(new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
  const horizon = new Date(date); horizon.setDate(horizon.getDate() + 30)
  const end = `${horizon.getFullYear()}-${String(horizon.getMonth() + 1).padStart(2, '0')}-${String(horizon.getDate()).padStart(2, '0')}`
  const points = cash === null ? [] : [...projection].filter(([key, point]) => key >= today && key <= end && finite(point?.bal))
  const floor = points.reduce((lowest, [key, point]) => !lowest || Number(point.bal) < lowest.balance ? { date:key, balance:Number(point.bal) } : lowest, null)
  const monthEndValue = cash === null ? null : projection.get(monthEndDate)?.bal
  const monthEnd = finite(monthEndValue) ? Number(monthEndValue) : null
  const attention = []
  if (floor?.balance < 0) attention.push({ id:'shortfall', title:`Projected cash shortfall · ${floor.date}`, detail:`Forecast reaches ${new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'}).format(floor.balance)}. Review expected deposits and payment timing.`, date:floor.date })
  if (error || !live || transactionStatus !== 'fresh') attention.push({ id:'bank', title:error ? 'Bank update needs attention' : 'Bank evidence needs verification', detail:'Review balance and transaction update status before relying on the forecast.', view:'accounts' })
  const earlier = cash === null ? 0 : Number(projection.get(today)?.unresolvedPastCount || 0)
  if (earlier > 0) attention.push({ id:'earlier', title:`${earlier} earlier scheduled items need review`, detail:"No confirmed bank match. Excluded from today's projection; review before rescheduling.", view:'transactions' })
  if (unmappedCount > 0) attention.push({ id:'unmapped', title:`${unmappedCount} bank transactions need account links`, detail:'Unlinked rows are excluded from forecast totals. Review all bank activity.', view:'transactions' })
  return {cash, monthEnd, monthEndDate, floor, attention}
}
