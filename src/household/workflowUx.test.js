import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Calendar exposes an agenda-first phone flow and correctly labels its timeframe', () => {
  const calendar = read('../family/FamilyCalendar.jsx')
  const styles = read('../family/FamilyCalendarViews.css')
  assert.match(calendar, /selectLabel="Select calendar timeframe"/)
  assert.match(calendar, /Choose the useful view/)
  assert.match(calendar, /upcomingAgendaDays/)
  assert.match(styles, /max-width: 720px[\s\S]*family-calendar-mobile-agenda \{ display: block/)
})

test('Operations offers a direct all-overdue view and uses honest empty copy', () => {
  const operations = read('./HouseholdMaintenance.jsx')
  assert.match(operations, /useState\('operations'\)/, 'Household Operations should open on its Operations workspace')
  assert.match(operations, /Show all.*overdue.*responsibilit/)
  assert.match(operations, /overdueOnly/)
  assert.doesNotMatch(operations, /responsibility\{visibleTasks\.length === 1 \? '' : 'ies'\}/)
  assert.match(operations, /No responsibilities are assigned to or covered by/)
})

test('Settings keeps account status visible and provides verified password changes', () => {
  const accounts = read('./HouseholdAuth.jsx')
  assert.match(accounts, /setHouseholdMemberPassword/)
  assert.match(accounts, /onSubmit=\{savePassword\}/)
  assert.match(accounts, /Other sessions for this account have been signed out|other active sessions/)
  assert.doesNotMatch(accounts, /Password changes unavailable/)
})

test('Projects distinguish an empty portfolio from an empty filter result', () => {
  const projects = read('../homehq/HomeHQ.jsx')
  assert.match(projects, /No projects match these filters/)
  assert.match(projects, /Create first project/)
})
