import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_NAVIGATION_HISTORY, popNavigationLocation, pushNavigationLocation } from '../navigationHistory.js'

test('records the prior application view for a drill-down', () => {
  const current = { pillarId:'finance', viewId:'dashboard', label:'Finance Dashboard' }
  const next = { pillarId:'finance', viewId:'transactions', label:'Transactions' }
  assert.deepEqual(pushNavigationLocation([], current, next), [current])
})

test('does not add duplicate locations to navigation history', () => {
  const current = { pillarId:'finance', viewId:'transactions', label:'Transactions' }
  assert.deepEqual(pushNavigationLocation([current], current, { ...current }), [current])
})

test('returns the most recent location and retains the remaining trail', () => {
  const today = { pillarId:'', viewId:'today', label:'Today' }
  const dashboard = { pillarId:'finance', viewId:'dashboard', label:'Finance Dashboard' }
  assert.deepEqual(popNavigationLocation([today, dashboard]), { previous:dashboard, history:[today] })
})

test('bounds navigation history without losing the newest return locations', () => {
  let history = []
  for (let index = 0; index <= MAX_NAVIGATION_HISTORY; index += 1) {
    history = pushNavigationLocation(history, { pillarId:'finance', viewId:`view-${index}`, label:`View ${index}` }, { pillarId:'finance', viewId:`view-${index + 1}` })
  }
  assert.equal(history.length, MAX_NAVIGATION_HISTORY)
  assert.equal(history[0].viewId, 'view-1')
  assert.equal(history.at(-1).viewId, `view-${MAX_NAVIGATION_HISTORY}`)
})
