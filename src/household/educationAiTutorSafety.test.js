import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Education AI keeps credentials server-side and reading evidence reviewable',async()=>{
  const client=await readFile(new URL('../education/aiTutorApi.js',import.meta.url),'utf8')
  const reading=await readFile(new URL('../../netlify/functions/education-reading-grade.mjs',import.meta.url),'utf8')
  const exercise=await readFile(new URL('../../netlify/functions/education-ai-exercise.mjs',import.meta.url),'utf8')
  const grading=await readFile(new URL('../../netlify/functions/education-ai-grade.mjs',import.meta.url),'utf8')
  const speech=await readFile(new URL('../../netlify/functions/education-directions-speech.mjs',import.meta.url),'utf8')
  const tutor=await readFile(new URL('../education/IsaiahDailyTutor.jsx',import.meta.url),'utf8')

  assert.doesNotMatch(client,/OPENAI_API_KEY/)
  assert.match(reading,/readSession/)
  assert.match(reading,/\/v1\/audio\/transcriptions/)
  assert.match(reading,/scoreReadingTranscript/)
  assert.match(reading,/rawAudioRetained:false/)
  assert.match(reading,/draft-adult-review-required/)
  assert.doesNotMatch(reading,/\.setJSON\(/)
  assert.match(exercise,/requiredDirectionPoints/)
  assert.match(exercise,/publicQuestion/)
  assert.match(grading,/following written directions/)
  assert.match(grading,/contentMasteryAffected:false/)
  assert.match(grading,/supportLevel:supportUsed\?'audio-supported':'independent-reading'/)
  assert.match(speech,/\/v1\/audio\/speech/)
  assert.match(speech,/readSession/)
  assert.match(tutor,/Read the directions yourself/)
  assert.match(tutor,/Read directions to me/)
  assert.match(tutor,/The exercise stays locked until all material directions are understood/)
  assert.match(tutor,/Adult review controls mastery/)
  assert.match(tutor,/Start 60-second reading probe/)
  assert.match(tutor,/Microphone access was not allowed/)
})
