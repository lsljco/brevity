const collator = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' })
export function financialSortValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value ?? '').trim()
  if (!text || /^(?:—|–|-|unavailable|unknown|not within horizon|n\/a)$/i.test(text)) return null
  const month = ['january','february','march','april','may','june','july','august','september','october','november','december'].findIndex(name=>name===text.toLowerCase()||name.slice(0,3)===text.toLowerCase())
  if(month>=0)return month+1
  const number = text.replace(/[,$%\s]/g, '').replace(/−/g, '-').replace(/^\((.*)\)$/, '-$1')
  if (/^[+-]?\d+(?:\.\d+)?$/.test(number)) return Number(number)
  if (/^\d{4}-\d{2}(?:-\d{2})?$/.test(text)) return Date.parse(text.length === 7 ? text + '-01' : text)
  if (/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d/i.test(text) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
    const date = Date.parse(text)
    if (Number.isFinite(date)) return date
  }
  return text
}
export function compareFinancialValues(a, b, direction = 'asc') {
  a = financialSortValue(a); b = financialSortValue(b)
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
  const result = typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b))
  return direction === 'desc' ? -result : result
}
// Section dividers, totals and payoff milestones retain their position. Only
// peer rows within each section are sorted; financial values are never changed.
export function sortFinancialSections(rows, value, pinned, direction) {
  const output = [], section = []
  const flush = () => { output.push(...section.sort((a,b) => compareFinancialValues(value(a),value(b),direction))); section.length = 0 }
  for (const row of rows) { if (pinned(row)) { flush(); output.push(row) } else section.push(row) }
  flush(); return output
}
