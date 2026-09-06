import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { BASE_ANALYSIS_GUIDANCE, PILLAR_INSTRUCTIONS } from '../../netlify/functions/pillar-analysis.mjs'

const expectedPillars = ['spiritual', 'health', 'fitness', 'household', 'education', 'finance', 'ministry']

test('every pillar receives the insight-led analysis contract', () => {
  assert.deepEqual(Object.keys(PILLAR_INSTRUCTIONS), expectedPillars)
  assert.match(BASE_ANALYSIS_GUIDANCE, /Never state, repeat, or emphasize who owns a pillar/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /no more than three high-value insights/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /no more than two meaningful next moves/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /Never infer that a pillar owner is responsible for another household member/)
})

test('spiritual analysis preserves each member’s personal responsibility', () => {
  const instructions = `${BASE_ANALYSIS_GUIDANCE}\n${PILLAR_INSTRUCTIONS.spiritual}`
  assert.match(instructions, /Each household member is responsible for personally engaging/)
  assert.match(instructions, /without making one person the household's spiritual supervisor/)
  assert.doesNotMatch(instructions, /Lorenzo owns this pillar/i)
  assert.doesNotMatch(instructions, /Lorenzo is the owner/i)
})

test('pillar analysis UI presents insight and growth without an ownership section', async () => {
  const source = await readFile(new URL('./PillarAnalysis.jsx', import.meta.url), 'utf8')
  assert.match(source, /Meaningful Next Moves/)
  assert.match(source, /Questions Worth Considering/)
  assert.match(source, /How Progress Will Show/)
  assert.doesNotMatch(source, /Who Does What/)
  assert.doesNotMatch(source, />Ownership</)
  assert.doesNotMatch(source, /analysis\.owners/)
  assert.match(source, /result\?\.pillar===pillar\.id && result\?\.date===plan\?\.date/)
})
