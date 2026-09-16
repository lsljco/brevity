import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreReadingTranscript, tokenizeReading } from './readingFluency.js'

test('tokenizer normalizes punctuation and curly apostrophes',()=>{
  assert.deepEqual(tokenizeReading("Ben’s dog, RUNS!"),["ben's",'dog','runs'])
})

test('unread passage remainder is not counted as oral-reading errors',()=>{
  const score=scoreReadingTranscript({referenceText:'one two three four five six',transcript:'one two three',elapsedSeconds:60})
  assert.equal(score.referenceWordsAssessed,3)
  assert.equal(score.correctWords,3)
  assert.equal(score.accuracy,100)
  assert.equal(score.wcpm,3)
  assert.equal(score.omissions.length,0)
})

test('substitutions and omissions reduce accuracy deterministically',()=>{
  const score=scoreReadingTranscript({referenceText:'the quick brown fox jumps',transcript:'the fast fox jumps',elapsedSeconds:60})
  assert.equal(score.correctWords,3)
  assert.equal(score.referenceWordsAssessed,5)
  assert.equal(score.substitutions.length+score.omissions.length,2)
  assert.equal(score.accuracy,60)
})

test('insertions are visible without treating unread remainder as errors',()=>{
  const score=scoreReadingTranscript({referenceText:'one two three four',transcript:'one big two three',elapsedSeconds:30})
  assert.equal(score.insertions.length,1)
  assert.equal(score.correctWords,3)
  assert.equal(score.referenceWordsAssessed,3)
  assert.equal(score.wcpm,6)
})
