import test from 'node:test'
import assert from 'node:assert/strict'
import { filterTypeaheadOptions } from './typeahead.js'

test('typeahead shows every option when focused with an empty query', () => {
  assert.deepEqual(filterTypeaheadOptions(['Amazon', 'AT&T'], ''), ['Amazon', 'AT&T'])
})

test('typeahead matches text anywhere and ignores case', () => {
  assert.deepEqual(filterTypeaheadOptions(['General Merchandise', 'Phone', 'Cell Phones'], 'phone'), ['Phone', 'Cell Phones'])
})
