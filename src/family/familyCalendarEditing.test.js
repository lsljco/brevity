import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('./FamilyCalendar.jsx', import.meta.url),'utf8')
const styles = [
  fs.readFileSync(new URL('./FamilyCalendar.css', import.meta.url),'utf8'),
  fs.readFileSync(new URL('./FamilyCalendarViews.css', import.meta.url),'utf8'),
].join('\n')

test('direct Family Calendar changes use reviewed server-side Action Mode execution', () => {
  assert.match(source,/prepareCalendarAction/)
  assert.match(source,/executeAssistantProposal/)
  assert.match(source,/step:'review'/)
  assert.match(source,/Action Mode will record the actor, timestamp, affected record, and prior values for Undo/)
  assert.match(source,/<dt>Notes<\/dt>/)
  assert.match(source,/getHouseholdDateKey\(\)/)
  assert.doesNotMatch(source,/event\?\.href/)
  assert.doesNotMatch(source,/writeJson\(/)
  assert.doesNotMatch(source,/localStorage\.setItem\(FAMILY_CALENDAR_KEY/)
})

test('native Apple and source-managed Brevity events remain read-only in the direct editor', () => {
  assert.match(source,/canEditBrevityCalendarEvent\(event,calendarAccess\)/)
  assert.match(source,/Apple Family Calendar · Read-only/)
  assert.match(source,/Brevity · Managed in source workflow/)
  assert.match(source,/getActionMode\(\)/)
})

test('phone and tablet Calendar controls avoid known overflow and touch-target failures', () => {
  assert.match(styles,/@media \(min-width:721px\) and \(max-width:900px\)/)
  assert.match(styles,/\.family-calendar-grid\{min-width:640px\}/)
  assert.match(styles,/\.family-calendar-month-navigation \{ display: none !important; \}/)
  assert.match(styles,/@media \(pointer: coarse\)/)
  assert.match(styles,/width: 44px;/)
  assert.match(styles,/env\(safe-area-inset-bottom\)/)
})
