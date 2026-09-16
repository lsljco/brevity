import test from 'node:test'
import assert from 'node:assert/strict'
import { compactEditableLines, compactTitledItems, joinEditableLines, splitEditableLines } from './lineEditing.js'

test('preserves spaces and blank lines while a multiline field is being edited', () => {
  const typed = 'Healing for Lorenzo\nFamily unity '
  assert.equal(joinEditableLines(splitEditableLines(typed)), typed)
})

test('cleans only when multiline values are saved', () => {
  assert.deepEqual(compactEditableLines([' Healing for Lorenzo ', '', '  Family unity  ']), ['Healing for Lorenzo', 'Family unity'])
  assert.deepEqual(compactTitledItems([{ id: 'one', title: ' Pay bill ' }, { id: 'blank', title: ' ' }]), [{ id: 'one', title: 'Pay bill' }])
})
