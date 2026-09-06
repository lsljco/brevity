import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { BASE_ANALYSIS_GUIDANCE, buildPillarAnalysisPrompt, PILLAR_INSTRUCTIONS } from '../../netlify/functions/pillar-analysis.mjs'

const expectedPillars = ['spiritual', 'health', 'fitness', 'household', 'education', 'finance', 'ministry']

test('every pillar receives the insight-led analysis contract', () => {
  assert.deepEqual(Object.keys(PILLAR_INSTRUCTIONS), expectedPillars)
  assert.match(BASE_ANALYSIS_GUIDANCE, /Never state, repeat, or emphasize who owns a pillar/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /no more than three high-value insights/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /no more than two meaningful next moves/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /Never infer that a pillar owner is responsible for another household member/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /Set decisions to an empty array unless/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /generic CONFIRM statement.*is not a decision/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /Never combine several entries inside one string/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /Treat plans as intentions, not evidence/)
  assert.match(BASE_ANALYSIS_GUIDANCE, /pillar's own facts as the center of gravity/)
})

test('spiritual analysis preserves each member’s personal responsibility', () => {
  const instructions = `${BASE_ANALYSIS_GUIDANCE}\n${PILLAR_INSTRUCTIONS.spiritual}`
  assert.match(instructions, /Each household member is responsible for personally engaging/)
  assert.match(instructions, /without making one person the household's spiritual supervisor/)
  assert.doesNotMatch(instructions, /Lorenzo owns this pillar/i)
  assert.doesNotMatch(instructions, /Lorenzo is the owner/i)
})

test('each prompt is isolated to the selected pillar data', () => {
  const prompt = buildPillarAnalysisPrompt({
    pillar:'household',
    date:'2026-09-06',
    currentMember:'Larry',
    plan:{
      spiritual:{ devotionFocus:'SPIRITUAL_SENTINEL' },
      household:{ weeklyFocus:'HOUSEHOLD_SENTINEL' },
    },
    localContext:{ projects:[{ title:'PROJECT_SENTINEL' }] },
  })
  assert.match(prompt, /HOUSEHOLD_SENTINEL/)
  assert.match(prompt, /PROJECT_SENTINEL/)
  assert.doesNotMatch(prompt, /SPIRITUAL_SENTINEL/)
  assert.match(prompt, /requested pillar is the absolute scope/)
})

test('education analysis keeps routine management out of the daily message', () => {
  assert.match(PILLAR_INSTRUCTIONS.education, /standing routine and management details as background/)
  assert.match(PILLAR_INSTRUCTIONS.education, /Never discuss who supervises, owns, or is accountable/)
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
