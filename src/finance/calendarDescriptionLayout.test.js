import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const financePlannerSource = readFileSync(new URL('./FinancePlanner.jsx', import.meta.url), 'utf8')

test('iPad Cash Forecast entries wrap complete descriptions without obscuring amounts', () => {
  assert.match(financePlannerSource, /@media \(max-width: 1366px\)/)
  assert.match(financePlannerSource, /\.finance-calendar-description\s*\{[\s\S]*?white-space:\s*normal\s*!important/)
  assert.match(financePlannerSource, /\.finance-calendar-description\s*\{[\s\S]*?overflow-wrap:\s*anywhere\s*!important/)
  assert.match(financePlannerSource, /\.finance-calendar-amount\s*\{[\s\S]*?white-space:\s*nowrap\s*!important/)
  assert.equal((financePlannerSource.match(/className="finance-calendar-description"/g) || []).length, 2)
  assert.equal((financePlannerSource.match(/className="finance-calendar-amount"/g) || []).length, 2)
})
