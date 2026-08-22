import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeSermonSections, sermonItemParagraphs } from '../../netlify/functions/sermon-documents.mjs'

const section = (sections, heading) => sections.find(([name]) => name === heading)?.[1] || []

test('detailed sermon document sections retain nested descriptions, steps, and actions', () => {
  const sections = normalizeSermonSections({
    architecturalFrameworks:[{title:'Formation Path',description:'A complete pathway.',items:[{label:'Hearing',detail:'Begins the pathway.'}]}],
    practicalApplication:[{title:'Formation Audit',paragraphs:['Trace the gap.'],steps:['Name the fruit.','Complete the action.']}],
    weeklyCharge:{title:'One Completed Pathway',paragraphs:['Finish the work.'],actions:['Choose one area.','Review the fruit.']},
  })

  assert.deepEqual(section(sections,'ARCHITECTURAL FRAMEWORKS')[0],{
    title:'Formation Path',description:'A complete pathway.',items:[{label:'Hearing',detail:'Begins the pathway.'}],
  })
  assert.deepEqual(section(sections,'PRACTICAL APPLICATION')[0].steps,['Name the fruit.','Complete the action.'])
  assert.deepEqual(section(sections,'WEEKLY CHARGE')[0].actions,['Choose one area.','Review the fruit.'])
  assert.deepEqual(sermonItemParagraphs(section(sections,'ARCHITECTURAL FRAMEWORKS')[0]),[
    'A complete pathway.','Hearing — Begins the pathway.',
  ])
  assert.deepEqual(sermonItemParagraphs(section(sections,'PRACTICAL APPLICATION')[0]),[
    'Trace the gap.','Name the fruit.','Complete the action.',
  ])
  assert.deepEqual(sermonItemParagraphs(section(sections,'WEEKLY CHARGE')[0]),[
    'Finish the work.','Choose one area.','Review the fruit.',
  ])
})

test('legacy sermon fields remain available for document export', () => {
  const sections = normalizeSermonSections({
    bigIdea:'Faith becomes visible in obedience.',
    scriptures:['James 1:22'],
    foundationalTruths:['Hearing is not completion.'],
    applicationQuestions:['What will I obey?'],
  })

  assert.deepEqual(section(sections,'THESIS'),['Faith becomes visible in obedience.'])
  assert.equal(section(sections,'PRIMARY SCRIPTURES')[0],'James 1:22')
  assert.deepEqual(section(sections,'KINGDOM PRINCIPLES'),['Hearing is not completion.'])
  assert.deepEqual(section(sections,'REFLECTION QUESTIONS'),['What will I obey?'])
})
