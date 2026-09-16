import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Education AI keeps credentials server-side and reading evidence reviewable',async()=>{
  const client=await readFile(new URL('../education/aiTutorApi.js',import.meta.url),'utf8')
  const reading=await readFile(new URL('../../netlify/functions/education-reading-grade.mjs',import.meta.url),'utf8')
  const exercise=await readFile(new URL('../../netlify/functions/education-ai-exercise.mjs',import.meta.url),'utf8')
  const grading=await readFile(new URL('../../netlify/functions/education-ai-grade.mjs',import.meta.url),'utf8')
  const tutor=await readFile(new URL('../education/IsaiahDailyTutor.jsx',import.meta.url),'utf8')

  assert.doesNotMatch(client,/OPENAI_API_KEY/)
  assert.match(reading,/readSession/)
  assert.match(reading,/\/v1\/audio\/transcriptions/)
  assert.match(reading,/scoreReadingTranscript/)
  assert.match(reading,/rawAudioRetained:false/)
  assert.match(reading,/draft-adult-review-required/)
  assert.doesNotMatch(reading,/\.setJSON\(/)
  assert.match(exercise,/readSession/)
  assert.match(exercise,/json_schema/)
  assert.match(exercise,/publicQuestion/)
  assert.match(grading,/reviewed:false/)
  assert.match(grading,/adult-reviewed session completion controls mastery promotion/i)
  assert.match(tutor,/Adult review controls mastery/)
  assert.match(tutor,/Start 60-second reading probe/)
  assert.match(tutor,/Microphone access was not allowed/)
})
