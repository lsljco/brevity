import test from 'node:test'
import assert from 'node:assert/strict'
import { importSermonFields, importedWorkspaceSermon } from '../../netlify/lib/sermon-workspace-import.mjs'

test('maps builder manuscript, series, scripture and notes without marking it approved',()=>{
  const fields=importSermonFields({sermon:{series:'Architecture of Wisdom',sermon_title:'Biblical Watchfulness',big_idea:'Faithful while waiting',opening_setup:'Opening words',exposition:'The text says…'},notes:{scripture_reference:'Mark 13:33',summary:'Study notes'},sourceName:'Apostolic Vault'})
  assert.equal(fields.seriesTitle,'Architecture of Wisdom')
  assert.equal(fields.scripture,'Mark 13:33')
  assert.match(fields.outline,/Opening Setup\nOpening words\n\nExposition\nThe text says/)
  const record=importedWorkspaceSermon({fields,sourceKey:'apostolic:lorenzo:s_1',member:'Lorenzo',seriesId:'series-1',id:'sermon-1',now:new Date('2026-09-27T12:00:00Z')})
  assert.equal(record.approvedNotes,'')
  assert.equal(record.status,'Draft')
  assert.equal(record.sourceKey,'apostolic:lorenzo:s_1')
})
test('preserves pasted manuscript and rejects empty input',()=>{
  const fields=importSermonFields({rawText:'Before You Knew You\n\nThe first paragraph.\nThe second paragraph.',sourceName:'Pasted text'})
  assert.equal(fields.title,'Before You Knew You')
  assert.equal(fields.sourceNotes,fields.outline)
  assert.throws(()=>importSermonFields({rawText:'   '}),/Paste text/)
})
