export function validPlanDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value
}

export function shiftPlanDate(value, days) {
  if (!validPlanDate(value)) throw new Error('A valid daily plan date is required.')
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  const shifted = date.toISOString().slice(0,10)
  return validPlanDate(shifted) ? shifted : value
}
