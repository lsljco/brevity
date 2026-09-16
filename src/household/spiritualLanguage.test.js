import test from 'node:test'
import assert from 'node:assert/strict'
import spiritualLanguage from '../../netlify/lib/spiritual-language.cjs'

const { sharedSpiritualText, sharedSpiritualValue } = spiritualLanguage

test('removes only explicit spiritual ownership language', () => {
  assert.equal(
    sharedSpiritualText('Lorenzo owns this pillar and must lead the household in Scripture, devotion, prayer, and concrete obedience before breakfast.'),
    'Today’s spiritual focus is shared, while each household member remains responsible for their own response before breakfast.',
  )
})

test('preserves proper names and sermon attribution everywhere else', () => {
  const source = {
    preacher: 'Pastor Lorenzo Seay',
    title: 'Lorenzo Leads With Grace',
    notes: ['Lorenzo must prepare the sermon notes.', 'Pray for Lorenzo.'],
  }
  assert.deepEqual(sharedSpiritualValue(source), source)
})
