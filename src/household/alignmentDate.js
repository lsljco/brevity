const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function nextDailyPlanDate(dateKey) {
  const match = DATE_KEY_PATTERN.exec(String(dateKey || ''))
  if (!match) throw new Error(`Invalid daily plan date: ${dateKey}`)

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(Date.UTC(year, month - 1, day))

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid daily plan date: ${dateKey}`)
  }

  date.setUTCDate(date.getUTCDate() + 1)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function formatDailyPlanDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}
