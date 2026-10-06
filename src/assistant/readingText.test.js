import test from 'node:test'
import assert from 'node:assert/strict'
import { speechChunks } from './readingText.js'

test('long readings retain all words in bounded requests',()=>{
  const text=Array.from({length:1600},(_,i)=>`Teaching-${i}.`).join(' ')
  const chunks=speechChunks(text)
  assert.ok(chunks.length>1)
  assert.ok(chunks.every(chunk=>chunk.length<=1800))
  assert.equal(chunks.join(' '),text)
  assert.deepEqual(speechChunks('   '),[])
})
test('unbroken text remains bounded and complete',()=>{
  const text='a'.repeat(4000)
  assert.equal(speechChunks(text).join(''),text)
})
