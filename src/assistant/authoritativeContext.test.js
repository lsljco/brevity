import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAuthoritativeAssistantContext, householdDate, readOptionalAuthoritativeRecord, sanitizeAuthoritativeContext } from '../../netlify/lib/assistant-authoritative-context.mjs'

test('household date uses the configured household time zone', () => {
  assert.equal(householdDate(new Date('2026-08-27T02:00:00.000Z'), 'America/New_York'), '2026-08-26')
})

test('authoritative Assistant context includes current daily plan and rolling meals with provenance', async () => {
  const context = await buildAuthoritativeAssistantContext({
    member: 'Larry',
    date: '2026-08-26',
    now: new Date('2026-08-26T12:00:00.000Z'),
    loadDailyPlan: async () => ({ id: 'daily-plan-2026-08-26', date: '2026-08-26', version: 4, updatedAt: '2026-08-26T11:00:00.000Z', theme: 'Finish what matters', spiritual: { sermonNotes: { title: 'Full Notes', executiveSummary: 'Useful summary', sections: [{ content: 'Long document body' }] } } }),
    loadMealWindow: async () => ({ timeZone: 'America/New_York', startDate: '2026-08-26', days: [{ date: '2026-08-26', version: 2, updatedAt: '2026-08-26T10:00:00.000Z', resolvedMeals: { dinner: { id: 'salmon', name: 'Salmon and asparagus', macros: { calories: 480 }, macroBasis: 'estimated' } } }] }),
    loadActiveSermon: async () => ({ id: 'sermon-1', activatedAt: '2026-08-23T15:00:00.000Z', source: { name: 'From the Page to the Pattern' }, sermonNotes: { title: 'From the Page to the Pattern', executiveSummary: 'Meditate until the Word becomes pattern.' } }),
    loadSharedRecords: async()=>({
      lslj_finance_v9:{version:7,updatedAt:'2026-08-26T11:30:00.000Z',value:JSON.stringify({transactions:[{id:'mortgage',acct:'operating',name:'Mortgage',type:'expense',cat:'Housing',freq:'monthly',start:'2026-08-01'},{id:'one',name:'One time',freq:'once'}]})},
      homehq_items_v1:{version:3,value:JSON.stringify([{id:'roof',title:'Roof'}])},
      family_calendar_events_v1:{version:4,value:JSON.stringify([
        {id:'meeting-1',source:'finance-meeting',title:'Jabin will meet Tara',owner:'Tarrica',participants:['Jabin'],notes:'Tara will follow up.'},
        {id:'apple-1',source:'icloud',title:'Tara family reunion',owner:'Tara'},
      ])},
      brevity_finance_scenarios_v1:{version:2,value:JSON.stringify({expenseMode:'scenario',planningExpense:21000,scenarios:[{id:'current',title:'Current',incomes:[{id:'salary',description:'Salary',monthlyNet:5000}]}]})},
    }),
  })

  assert.equal(context.signedInMember, 'Larry')
  assert.equal(context.dailyPlan.version, 4)
  assert.equal(context.dailyPlan.spiritual.sermonNotes.executiveSummary, 'Useful summary')
  assert.equal(context.dailyPlan.spiritual.sermonNotes.sections, undefined)
  assert.equal(context.rollingMealPlan.days[0].meals.dinner.name, 'Salmon and asparagus')
  assert.equal(context.activeSermon.title, 'From the Page to the Pattern')
  assert.equal(context.actionRecords.finance.recurringRecords[0].id,'mortgage')
  assert.equal(context.actionRecords.finance.recurringRecords[0].acct,'operating')
  assert.equal(context.actionRecords.finance.recurringRecords[0].budgetLineId,'operating:mortgage')
  assert.equal(context.actionRecords.projects[0].id,'roof')
  assert.equal(context.actionRecords.familyCalendarEvents[0].title,'Javin will meet Terica')
  assert.equal(context.actionRecords.familyCalendarEvents[0].owner,'Terica')
  assert.deepEqual(context.actionRecords.familyCalendarEvents[0].participants,['Javin'])
  assert.equal(context.actionRecords.familyCalendarEvents[0].notes,'Terica will follow up.')
  assert.equal(context.actionRecords.familyCalendarEvents[1].title,'Tara family reunion')
  assert.equal(context.actionRecords.finance.forecasts.scenarios[0].incomes[0].id,'salary')
  assert.equal(context.actionRecords.versions.lslj_finance_v9,7)
  assert.ok(context.sources.every(source => source.authority === 'canonical'))
  assert.ok(context.sources.every(source => source.state === 'available'))
})

test('server context strips credentials and encoded attachments', () => {
  const sanitized = sanitizeAuthoritativeContext({ accessToken: 'secret', nested: { password: 'hidden', safe: 'yes' }, photo: `data:image/png;base64,${'A'.repeat(500)}` })
  assert.equal(sanitized.accessToken, undefined)
  assert.equal(sanitized.nested.password, undefined)
  assert.equal(sanitized.nested.safe, 'yes')
  assert.equal(sanitized.photo, '[large value omitted]')
})

test('Assistant treats only a missing active sermon as absent and fails closed on storage outage', async () => {
  assert.equal(await readOptionalAuthoritativeRecord({ async getWithMetadata() { return null } }, 'active-sermon'), null)
  assert.equal(await readOptionalAuthoritativeRecord({ async getWithMetadata() { throw Object.assign(new Error('missing'), { name:'NotFoundError' }) } }, 'active-sermon'), null)
  await assert.rejects(buildAuthoritativeAssistantContext({
    member:'Larry',
    date:'2026-09-07',
    loadDailyPlan:async()=>null,
    loadMealWindow:async()=>({ days:[] }),
    loadActiveSermon:async()=>{ throw Object.assign(new Error('active sermon storage unavailable'), { statusCode:503 }) },
    loadSharedRecords:async()=>({}),
  }), /active sermon storage unavailable/)
})
