import test from 'node:test'
import assert from 'node:assert/strict'
import {weekdayForDate,alignSermonDate,sermonDateError} from '../../netlify/lib/calendar-date.mjs'
import {importSermonFields,importedWorkspaceSermon} from '../../netlify/lib/sermon-workspace-import.mjs'
test('calendar weekdays are exact, including leap days and invalid dates',()=>{
 assert.equal(weekdayForDate('2026-10-21'),'Wednesday')
 assert.equal(weekdayForDate('2026-10-18'),'Sunday')
 assert.equal(weekdayForDate('2026-10-25'),'Sunday')
 assert.equal(weekdayForDate('2028-02-29'),'Tuesday')
 for(const date of ['2026-02-29','2026-04-31','garbage',''])assert.equal(weekdayForDate(date),'')
})
test('date changes align weekday labels and preserve custom service names',()=>{
 assert.equal(alignSermonDate({date:'2026-10-21',serviceType:'Sunday'}).serviceType,'Wednesday')
 assert.equal(alignSermonDate({date:'2026-10-21',serviceType:'Prayer service'}).serviceType,'Prayer service')
 assert.match(sermonDateError({date:'2026-10-21',serviceType:'Sunday'}),/Wednesday, not Sunday/)
})
test('import preserves supplied dates and never invents a service date',()=>{
 const now=new Date('2026-10-21T23:00:00Z')
 const make=fields=>importedWorkspaceSermon({fields,now,id:'test'})
 const supplied=make(importSermonFields({sermon:{title:'Message',date:'2026-10-18'}}))
 assert.equal(supplied.date,'2026-10-18')
 assert.equal(supplied.serviceType,'Sunday')
 const missing=make(importSermonFields({rawText:'Message'}))
 assert.equal(missing.date,'')
 assert.equal(missing.serviceType,'')
 assert.throws(()=>importSermonFields({sermon:{title:'Bad date',date:'2026-02-30'}}),/YYYY-MM-DD/)
})
