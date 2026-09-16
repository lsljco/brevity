import assert from 'node:assert/strict'
import test from 'node:test'
import { hydrateGeneratedPlan } from '../../netlify/lib/household-plan-generator.mjs'

const item = title => ({ title, owner: 'Family', status: 'needs-decision', notes: '', date: '2026-08-31', startTime: '', endTime: '', priority: 'normal', calendarSync: false, requiresDecision: true, notificationLevel: 'action' })

test('generated plans enforce standing gym and Isaiah education routines', () => {
  const generated = {
    theme: 'Execute established rhythms', dayObjective: 'Complete the plan', governingPrinciple: 'Order', successStandard: 'Done',
    topPriorities: [], morningAlignment: { startTime: '04:45', notes: '', agenda: [] }, dayparts: [],
    spiritual: { scripture: [], devotionFocus: '', prayerFocus: [], discussionPrompts: [], obedienceAction: '', requiredOutput: '' },
    health: { breakfast: '', lunch: '', dinner: '', snacks: '', hydration: '', nextDayPrep: '', groceries: [], discussionPrompt: '' },
    fitness: { location: 'Lifetime Buckhead', workout: 'Chest and triceps', objective: '', departureTime: '', returnTime: '', recovery: '', participants: [], stepGoal: 10000, requiresDecision: true, discussionPrompt: 'Which location?' },
    household: { keyFocus: '', appointments: [], priorities: [], errands: [], openItems: [], careerPriorities: [] },
    education: { thinkTankTopic: '', thinkTankDeliverable: '', discussionPrompts: [], isaiah: { owner: 'CONFIRM', readingMinutes: 20, sightWordsMinutes: 10, comprehensionMinutes: 10, mathMinutes: 10, notes: '' } },
    finance: { bills: [], purchases: [], transfers: [], accountsToFund: [], incomePipeline: [], decisionRule: '', discussionPrompt: '', requiredOutput: '' },
    ministry: { meetings: [], contentFocus: '', fellowshipFollowUps: [], prayerNeeds: [], readinessChecklist: [], framework: '' },
    decisions: [item('Which Lifetime gym location are we using?'), item('Who supervises Isaiah’s learning block?'), item('Approve the contractor proposal')],
    recap: { closePrompts: [], tomorrowPrep: [] },
  }
  const mealDay = { version: 1, resolvedMeals: { breakfast: { name: 'Oatmeal' }, lunch: { name: 'Chicken' }, dinner: { name: 'Salmon' } } }

  const plan = hydrateGeneratedPlan(generated, '2026-08-31', mealDay)

  assert.equal(plan.fitness.location, 'Lifetime Gym')
  assert.equal(plan.fitness.requiresDecision, false)
  assert.equal(plan.education.isaiah.owner, 'Family')
  assert.deepEqual(plan.decisions.map(decision => decision.title), ['Approve the contractor proposal'])
})
