import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAuthoritativeAssistantContext, householdDate, sanitizeAuthoritativeContext } from '../../netlify/lib/assistant-authoritative-context.mjs'

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
  })

  assert.equal(context.signedInMember, 'Larry')
  assert.equal(context.dailyPlan.version, 4)
  assert.equal(context.dailyPlan.spiritual.sermonNotes.executiveSummary, 'Useful summary')
  assert.equal(context.dailyPlan.spiritual.sermonNotes.sections, undefined)
  assert.equal(context.rollingMealPlan.days[0].meals.dinner.name, 'Salmon and asparagus')
  assert.equal(context.activeSermon.title, 'From the Page to the Pattern')
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
