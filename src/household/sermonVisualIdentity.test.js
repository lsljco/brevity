import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { SERMON_CHARACTER_IDENTITY_PROMPT, SERMON_CHARACTER_REFERENCES, sermonCharacterSequence } from '../../netlify/lib/sermon-character-references.mjs'

test('sermon visuals rotate across the six approved identity references', () => {
  assert.equal(SERMON_CHARACTER_REFERENCES.length, 6)
  const sequence=sermonCharacterSequence('reviewed-sermon-source', 12)
  assert.equal(new Set(sequence.slice(0,6).map(reference=>reference.id)).size, 6)
  assert.deepEqual(sequence.slice(0,6).map(reference=>reference.id), sequence.slice(6,12).map(reference=>reference.id))
})

test('character references lock identity without locking pose or composition', () => {
  assert.match(SERMON_CHARACTER_IDENTITY_PROMPT,/identity reference only/i)
  assert.match(SERMON_CHARACTER_IDENTITY_PROMPT,/preserve the recognizable facial identity/i)
  for(const term of ['pose','facial expression','gaze','head angle','clothing','background','crop','camera angle','composition']) assert.match(SERMON_CHARACTER_IDENTITY_PROMPT,new RegExp(term,'i'))
  assert.match(SERMON_CHARACTER_IDENTITY_PROMPT,/Freely change expression, posture, body position, wardrobe, lighting, perspective, environment, and action/i)
  assert.match(SERMON_CHARACTER_IDENTITY_PROMPT,/do not force the referenced character/i)
})

test('approved identity references are server-side JPEG assets bundled with the sermon slide worker', async () => {
  for(const reference of SERMON_CHARACTER_REFERENCES){
    const bytes=await readFile(reference.url)
    assert.equal(bytes[0],0xff)
    assert.equal(bytes[1],0xd8)
  }
  const config=await readFile(new URL('../../netlify.toml',import.meta.url),'utf8')
  assert.match(config,/\[functions\."sermon-slides-background"\][\s\S]*included_files\s*=\s*\["netlify\/assets\/sermon-characters\/\*\*"\]/)
})

test('sermon image generation uses image edits with one identity reference and keeps generation fallback', async () => {
  const source=await readFile(new URL('../../netlify/lib/sermon-slides.mjs',import.meta.url),'utf8')
  assert.match(source,/\/v1\/images\/edits/)
  assert.match(source,/form\.append\('image\[\]'/)
  assert.match(source,/SERMON_CHARACTER_IDENTITY_PROMPT/)
  assert.match(source,/sermonCharacterReferenceFor\(identitySeed,index\)/)
  assert.match(source,/sermonCharacterReferenceFor\(identitySeed,specs\.length\+index\)/)
  assert.match(source,/\/v1\/images\/generations/)
})
