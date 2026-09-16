import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalDaypartId, orderDayparts } from './daypartOrder.js'

test('normalizes common daypart id variants', () => {
  assert.equal(canonicalDaypartId('wind-down'), 'winddown')
  assert.equal(canonicalDaypartId('windDown'), 'winddown')
  assert.equal(canonicalDaypartId('WIND DOWN'), 'winddown')
})

test('orders known dayparts chronologically and leaves unknown blocks last', () => {
  const rows = [
    { id: 'windDown' }, { id: 'anchor' }, { id: 'later' }, { id: 'flex' }, { id: 'focus' },
  ]
  assert.deepEqual(orderDayparts(rows).map(row => row.id), ['anchor', 'focus', 'flex', 'windDown', 'later'])
})
