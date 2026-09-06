import test from 'node:test'
import assert from 'node:assert/strict'
import { assistantStarters } from './assistantStarters.js'

test('assistant starters are grounded in the current workflow', () => {
  assert.match(assistantStarters({activeView:'family-calendar'})[0], /calendar conflicts/)
  assert.match(assistantStarters({activeView:'meal-plan'})[0], /tomorrow’s meals/)
  assert.match(assistantStarters({activePillar:'finance'})[0], /variance/)
  assert.match(assistantStarters({activePillar:'education'})[0], /key message/)
})

test('default starters seek insight instead of generic page analysis', () => {
  const starters = assistantStarters()
  assert.equal(starters.length, 4)
  assert.ok(starters.every(starter => !/Analyze this page/i.test(starter)))
})
