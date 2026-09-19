import { test, expect } from '@playwright/test'
import { createEmptyDailyPlan } from '../src/household/dailyPlan.js'
import { blankMealReadiness, emptyPracticeDay, practiceRoutineNotes, shiftPracticeDate } from '../src/household/operatingPractices.js'
import { normalizeActionProposal } from '../netlify/lib/assistant-action-contract.mjs'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
async function backend(page, { readonly = false, activated = false } = {}) {
  const date = today(), member = readonly ? 'Nyla' : 'Larry'
  const schedule = { version: 1, blocks: [], routines: activated ? [{ id: 'finance-practice', title: 'Daily finance operations', owner: 'Larry', participants: [], enabled: true, startTime: '06:00', endTime: '06:15', days: [0,1,2,3,4,5,6], notes: practiceRoutineNotes({ policyId: 'FIN-001', effectiveDate: date, reviewDate: shiftPracticeDate(date, 7), backup: 'Lorenzo', procedure: 'Review transactions and upcoming obligations. Record unresolved questions.' }) }] : [], routineOverrides: {} }
  const plans = new Map(), prepared = [], writes = []
  const meal = type => ({ id: `test-${type}`, mealType: type, name: `Prepared ${type}`, description: 'Test fixture meal', prepMinutes: 10, totalMinutes: 20, ingredients: ['Test ingredients'], macros: { calories: 400, proteinGrams: 30 }, image: '/brevity-logo.png' })
  const permissions = Object.fromEntries(['Larry','Lorenzo','Terica','Nyla','Javin'].map(name => [name, { planning: !readonly, finance: !readonly, calendar: !readonly, projects: !readonly }]))
  await page.route('**/.netlify/functions/**', async route => {
    const request = route.request(), url = new URL(request.url()), endpoint = url.pathname.split('/').at(-1), action = url.searchParams.get('action')
    let body = {}
    if (endpoint === 'household-auth') body = action === 'session' ? { authenticated: true, member, role: readonly ? 'member' : 'admin', bootstrapRequired: false } : { members: [] }
    else if (endpoint === 'household-state') {
      if (request.method() !== 'GET') { writes.push(request.postDataJSON()); return route.fulfill({ status: 403, json: { error: 'Raw writes are forbidden in this fixture.' } }) }
      const key = 'brevity_household_schedule_v1'
      body = { records: { [key]: { key, value: JSON.stringify(schedule), version: 1, updatedAt: new Date().toISOString(), updatedBy: 'Larry' } }, serverTime: new Date().toISOString() }
    } else if (endpoint === 'household-data') {
      const target = url.searchParams.get('date') || date
      if (!plans.has(target)) {
        const plan = { ...createEmptyDailyPlan(target), version: 1 }
        plan.household.practiceDay = emptyPracticeDay()
        plans.set(target, plan)
      }
      body = { householdId: 'lslj-family', plan: plans.get(target) }
    } else if (endpoint === 'meal-plans') {
      const start = url.searchParams.get('startDate') || url.searchParams.get('date') || date
      const library = ['breakfast','lunch','dinner'].map(meal)
      body = { startDate: start, days: Array.from({ length: 7 }, (_, index) => ({ date: shiftPracticeDate(start, index), version: 1, resolvedMeals: Object.fromEntries(library.map(item => [item.mealType, item])), meals: Object.fromEntries(library.map(item => [item.mealType, item.id])) })), library, librarySummary: { total: 3, counts: { breakfast: 1, lunch: 1, dinner: 1 } } }
    } else if (endpoint === 'brevity-assistant-actions') {
      if (action === 'prepare-direct') {
        const input = request.postDataJSON()
        prepared.push(input)
        const proposal = normalizeActionProposal({ summary: input.summary, operations: input.operations || [input.operation] }, { member, role: readonly ? 'member' : 'admin', now: new Date(), id: `test-proposal-${prepared.length}` })
        body = { proposal, permissions, capabilities: { planning: true } }
      } else if (request.method() !== 'GET') {
        writes.push(request.postDataJSON())
        return route.fulfill({ status: 403, json: { error: 'This test only prepares reviews; no mutation is permitted.' } })
      } else body = { permissions, history: [], pending: [], capabilities: { planning: true }, version: 1 }
    } else if (endpoint === 'icloud-calendar') body = { events: [], connected: true, syncedAt: new Date().toISOString() }
    else if (endpoint === 'plaid-accounts') body = { connected: false, accounts: [], errors: [], syncedAt: new Date().toISOString() }
    else if (endpoint === 'plaid-transactions') body = { transactions: [], errors: [] }
    else if (endpoint === 'health-alerts') body = { alerts: [] }
    await route.fulfill({ status: 200, json: body })
  })
  return { date, plans, prepared, writes, schedule }
}
async function enter(page) {
  await page.goto('/')
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.getByTestId('operating-practices').getByRole('button', { name: 'Policies & Practices', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Policies & Practices', exact: true })).toBeVisible()
}
async function fits(page) {
  const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth - innerWidth, main: document.querySelector('.app-main').scrollWidth - document.querySelector('.app-main').clientWidth }))
  expect(overflow.document).toBeLessThanOrEqual(8)
  expect(overflow.main).toBeLessThanOrEqual(8)
}

test('agreement activation is explicit and opens review without changing the Schedule', async ({ page }, testInfo) => {
  const fixture = await backend(page)
  await enter(page)
  const finance = page.locator('.practice-card').filter({ hasText: 'FIN-001' })
  await expect(finance.getByRole('button', { name: 'Set up agreement' })).toBeEnabled()
  expect(fixture.prepared).toHaveLength(0)
  await finance.getByRole('button', { name: 'Set up agreement' }).click()
  const dialog = page.getByRole('dialog', { name: 'Activate FIN-001' })
  await expect(dialog.getByRole('button', { name: 'Review change' })).toBeDisabled()
  await dialog.getByLabel('Accountable owner').selectOption('Larry')
  await dialog.getByLabel('Agreed backup').selectOption('Lorenzo')
  await dialog.getByLabel('Routine starts').fill('06:00')
  await dialog.getByLabel('Routine ends').fill('06:15')
  await dialog.getByLabel(/I have discussed capacity/).check()
  await fits(page)
  await page.screenshot({ path: testInfo.outputPath('agreement-editor.png'), fullPage: false })
  await dialog.getByRole('button', { name: 'Review change' }).click()
  await expect.poll(() => fixture.prepared.length).toBe(1)
  expect(fixture.writes).toHaveLength(0)
  expect(fixture.schedule.routines).toHaveLength(0)
  const submitted = fixture.prepared[0].operation || fixture.prepared[0].operations[0]
  expect(submitted.type).toBe('household.schedule.routine.create')
})

test('readonly members can inspect readiness but cannot assign shared obligations', async ({ page }) => {
  const fixture = await backend(page, { readonly: true })
  await enter(page)
  await expect(page.getByTestId('operating-practices')).toContainText('View only')
  for (const button of await page.getByRole('button', { name: 'Set up agreement' }).all()) await expect(button).toBeDisabled()
  await page.getByRole('button', { name: 'Daily readiness', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Review breakfast coverage' })).toBeDisabled()
  await fits(page)
  expect(fixture.prepared).toHaveLength(0)
  expect(fixture.writes).toHaveLength(0)
})

test('dated readiness distinguishes planning from preparation and keeps recovery explicit', async ({ page }, testInfo) => {
  const fixture = await backend(page, { activated: true })
  await enter(page)
  await page.getByRole('button', { name: 'Daily readiness', exact: true }).click()
  const panel = page.getByTestId('operating-practices')
  await expect(panel).toContainText('Not yet recorded — not a violation')
  await expect(panel.getByRole('button', { name: 'Review lunch coverage' })).toBeEnabled()
  await panel.getByRole('button', { name: 'Review lunch coverage' }).click()
  const mealDialog = page.getByRole('dialog', { name: 'Lunch coverage' })
  await expect(mealDialog.getByLabel('Preparation status')).toHaveValue('unrecorded')
  await expect(mealDialog.getByLabel('Portions actually eaten')).toHaveValue('')
  await mealDialog.getByRole('button', { name: 'Close practice editor' }).click()
  await panel.getByRole('button', { name: 'Record result', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Check in: Daily finance operations' })
  await dialog.getByLabel('Recorded result').selectOption('blocked')
  await dialog.getByLabel('What happened?').fill('A source is unavailable')
  await dialog.getByLabel('Recovery action, owner and timing').fill('Larry will recheck the source before the next decision.')
  await dialog.getByRole('button', { name: 'Review change' }).click()
  await expect.poll(() => fixture.prepared.length).toBe(1)
  const operation = fixture.prepared[0].operations[0]
  expect(operation.targetDate).toBe(fixture.date)
  expect(operation.payload.patch.practiceDay.checkins[0].status).toBe('blocked')
  expect(fixture.plans.get(fixture.date).household.practiceDay.checkins).toHaveLength(0)
  expect(fixture.writes).toHaveLength(0)
})

test('daily dates, weekly review, and native Schedule and Inventory destinations are usable', async ({ page }, testInfo) => {
  await backend(page)
  await enter(page)
  await page.locator('.practice-tabs').getByRole('button', { name: 'Tomorrow', exact: true }).click()
  await expect(page.getByLabel('Household date')).toHaveValue(shiftPracticeDate(today(), 1))
  await page.getByRole('button', { name: 'Weekly family review', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Weekly review ·/ })).toBeVisible()
  await expect(page.getByText('No check-in evidence is recorded', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Daily readiness', exact: true }).click()
  await fits(page)
  await page.screenshot({ path: testInfo.outputPath('daily-readiness.png'), fullPage: false })
  await page.getByRole('button', { name: 'Check supplies & inventory' }).click()
  await expect(page.locator('.household-operations-tabs').getByRole('button', { name: 'Supplies & Inventory' })).toHaveClass(/active/)
})
