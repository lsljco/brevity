import assert from 'node:assert/strict'
import test from 'node:test'
import { createMealPlanRepository } from '../../netlify/lib/meal-plan-store.mjs'

function memoryStore() {
  const records = new Map()
  const etags = new Map()
  let sequence = 0
  return {
    records,
    async get(key) { return structuredClone(records.get(key) || null) },
    async getWithMetadata(key) { return records.has(key) ? { data:structuredClone(records.get(key)), etag:etags.get(key) } : null },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && records.has(key)) return { modified:false, etag:etags.get(key) }
      if (options.onlyIfMatch && options.onlyIfMatch !== etags.get(key)) return { modified:false, etag:etags.get(key) }
      const etag=`etag-${++sequence}`
      records.set(key, structuredClone(value));etags.set(key,etag)
      return { modified:true, etag }
    },
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
  assert.equal(plan.library.length, 90)
  assert.equal(memory.size, 0)
})

test('legacy direct substitutions cannot bypass Action Mode review', async () => {
  const store = memoryStore()
  const repository = createMealPlanRepository({
    store,
    now: () => new Date('2026-08-24T16:00:00.000Z'),
    createId: () => 'audit-1',
  })
  const plan = await repository.getWindow({ startDate: '2026-08-24' })
  const current = plan.days[0]
  const alternate = plan.library.find(meal => meal.mealType === 'dinner' && meal.id !== current.meals.dinner)
  await assert.rejects(repository.substitute({ date:current.date,mealType:'dinner',mealId:alternate.id,expectedVersion:current.version,actor:'Larry' }),error=>error.code==='REVIEW_REQUIRED')
  assert.equal((await repository.getDay(current.date)).meals.dinner,current.meals.dinner)
})

test('concurrent rolling-day initialization converges on one conditionally created record', async () => {
  const store = memoryStore()
  const repository = createMealPlanRepository({ store, now: () => new Date('2026-08-24T16:00:00.000Z') })
  const [first,second]=await Promise.all([repository.ensureDay('2026-08-24'),repository.ensureDay('2026-08-24')])
  assert.deepEqual(second,first)
  assert.equal(store.records.size,1)
  assert.equal(first.version,1)
})
