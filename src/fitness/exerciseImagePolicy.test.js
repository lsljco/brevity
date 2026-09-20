import test from 'node:test'
import assert from 'node:assert/strict'
import { ORIGINAL_EXERCISE_IMAGES, getDisplayExerciseImage } from './exerciseImagePolicy.js'
import { buildFitnessImagePrompt } from '../../netlify/lib/fitness-image.mjs'
const photo = name => `/fitness/exercises/${name}.webp`
const uuid = '3b1d88c2-25c0-4e49-93b3-f0bf8b20df82'

test('original image bindings are one-to-one, not per muscle group', () => {
  const values = Object.values(ORIGINAL_EXERCISE_IMAGES)
  assert.equal(values.length, new Set(values).size)
  assert.equal(getDisplayExerciseImage({id:'incline-press',image:photo(values[0])}),photo(values[0]))
  assert.equal(getDisplayExerciseImage({id:'machine-chest-press',image:photo(values[0])}),null)
})
test('every screenshot mismatch is blocked, including variations and cache-busting URLs', () => {
  for (const [id, asset] of [
    ['pec-deck','family-terica-cable-fly-v1'], ['single-cable-press','family-terica-cable-fly-v1'],
    ['cable-press-around','family-terica-cable-fly-v1'], ['landmine-press','family-shoulder-press-v2'],
    ['assisted-dip','family-larry-push-up-v1'], ['decline-push-up','family-larry-push-up-v1'],
    ['close-push-up','family-larry-push-up-v1'],
  ]) {
    assert.equal(getDisplayExerciseImage({id,image:photo(asset)}),null)
    assert.equal(getDisplayExerciseImage({id,image:`${photo(asset)}?v=2#preview`}),null)
  }
})
test('reported camera-facing originals are withdrawn even from their original exercises', () => {
  for (const id of ['cable-fly','push-up','shoulder-press','lat-pulldown'])
    assert.equal(getDisplayExerciseImage({id,image:photo(ORIGINAL_EXERCISE_IMAGES[id])}),null)
})
test('generated image URLs remain bound to the exact movement ID', () => {
  const image = `/.netlify/functions/fitness-images?id=pec-deck-terica-${uuid}`
  assert.equal(getDisplayExerciseImage({id:'pec-deck',image}),image)
  assert.equal(getDisplayExerciseImage({id:'cable-fly',image}),null)
  assert.equal(getDisplayExerciseImage({id:'pec',image}),null)
  assert.equal(getDisplayExerciseImage({id:'pec-deck',image:`${image}&id=other`}),null)
})
test('missing, unrelated, external, or malformed sources cannot become an exercise fallback', () => {
  for (const image of [null,'','/other.jpg','//outside.test/a.jpg','https://outside.test/a.jpg','/\\outside.test/a.jpg'])
    assert.equal(getDisplayExerciseImage({id:'pec-deck',image}),null)
  assert.equal(getDisplayExerciseImage(null),null)
})
test('generation prompt requires exact movement, natural gaze, and preserved identity/full framing', () => {
  const prompt = buildFitnessImagePrompt({id:'landmine-press',name:'Half-kneeling landmine press',equipment:'Barbell',cue:'Press up and forward.'},'Larry')
  for (const pattern of [/identity reference/i,/complete body/i,/do not crop/i,/Landscape 4:3/i,/EXACT exercise/i,/No eye contact with the camera/i,/unaware of the photographer/i,/head and neck remain appropriately aligned/i,/ONE knee on the floor/i,/landmine anchor/i,/No seated bench and no overhead dumbbells/i]) assert.match(prompt,pattern)
  assert.doesNotMatch(prompt,/Men's Health|Women's Health/)
})
test('distinct photographed variations receive distinct movement constraints', () => {
  const prompt = id => buildFitnessImagePrompt({id,name:id},'Terica')
  assert.match(prompt('pec-deck'),/actual pec-deck machine/i)
  assert.match(prompt('single-cable-press'),/ONE working arm/)
  assert.match(prompt('cable-press-around'),/across-body movement/i)
  assert.match(prompt('assisted-dip'),/assistance platform/i)
  assert.match(prompt('decline-push-up'),/BOTH FEET ELEVATED/)
  assert.match(prompt('close-push-up'),/hands narrowly spaced/i)
  assert.throws(() => buildFitnessImagePrompt({},'Larry'),/exact exercise ID/i)
})
