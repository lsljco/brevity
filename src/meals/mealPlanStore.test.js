import assert from 'node:assert/strict'
import test from 'node:test'
import { createMealPlanRepository } from '../../netlify/lib/meal-plan-store.mjs'

function memoryStore() {
  const records = new Map()
  return {
    records,
    async get(key) { return records.get(key) || null },
    async setJSON(key, value) { records.set(key, structuredClone(value)) },
  }
}

test('repository persists and returns a seven-day household plan', async () => {
  const store = memoryStore()
  const repository = createMealPlanRepository({ store, now: () => new Date('2026-08-24T16:00:00.000Z') })
  const first = await repository.getWindow()
  const second = await repository.getWindow()

  assert.equal(first.days.length, 7)
  assert.equal(first.library.length, 90)
  assert.equal(store.records.size, 7)
  assert.deepEqual(second.days, first.days)
})

test('read-only meal windows never create missing records', async () => {
  const memory = new Map()
  const store = { get: async key => memory.get(key) || null, setJSON: async (key, value) => memory.set(key, value) }
  const repository = createMealPlanRepository({ store, now: () => new Date('2026-08-24T12:00:00Z') })

  const plan = await repository.getWindowReadOnly({ startDate: '2026-08-24' })

  assert.equal(plan.days.length, 7)
  assert.equal(memory.size, 0)
})

test('substitution is category-safe, versioned and audited', async () => {
  const store = memoryStore()
  const repository = createMealPlanRepository({
    store,
    now: () => new Date('2026-08-24T16:00:00.000Z'),
    createId: () => 'audit-1',
  })
  const plan = await repository.getWindow({ startDate: '2026-08-24' })
  const current = plan.days[0]
  const alternate = plan.library.find(meal => meal.mealType === 'dinner' && meal.id !== current.meals.dinner)
  const updated = await repository.substitute({
    date: current.date,
    mealType: 'dinner',
    mealId: alternate.id,
    expectedVersion: current.version,
    actor: 'Larry',
  })

  assert.equal(updated.version, 2)
  assert.equal(updated.resolvedMeals.dinner.id, alternate.id)
  assert.equal(updated.substitutions.dinner.changedBy, 'Larry')
  assert.equal(store.records.get('lslj-family/audit/2026-08-24/audit-1').previousMealId, current.meals.dinner)
})

test('stale substitutions cannot overwrite a newer household choice', async () => {
  const store = memoryStore()
  const repository = createMealPlanRepository({ store, now: () => new Date('2026-08-24T16:00:00.000Z') })
  const plan = await repository.getWindow({ startDate: '2026-08-24' })
  const current = plan.days[0]
  const alternate = plan.library.find(meal => meal.mealType === 'lunch' && meal.id !== current.meals.lunch)
  await repository.substitute({ date: current.date, mealType: 'lunch', mealId: alternate.id, expectedVersion: 1 })

  await assert.rejects(
    repository.substitute({ date: current.date, mealType: 'lunch', mealId: alternate.id, expectedVersion: 1 }),
    error => error.code === 'VERSION_CONFLICT',
  )
})
