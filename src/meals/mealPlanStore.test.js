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

test('custom meals persist in the shared household library and count by meal type', async () => {
  const store = memoryStore()
  const repository = createMealPlanRepository({
    store,
    now: () => new Date('2026-09-10T20:15:00.000Z'),
    createId: () => 'meal-123',
  })
  const created = await repository.createMeal({
    actor:'Larry',
    meal:{
      mealType:'dinner',
      name:'Steak and Loaded Mashed Potatoes',
      description:'Steak with loaded mashed potatoes',
      ingredients:['Ribeye steak','Russet potatoes','Butter'],
      prepMinutes:45,
      cookMinutes:30,
      macros:{ calories:820, proteinGrams:58, carbohydrateGrams:52, fatGrams:42 },
    },
  })
  const plan = await repository.getWindowReadOnly({ startDate:'2026-09-10' })

  assert.equal(created.id, 'custom-dinner-meal-123')
  assert.equal(plan.library.length, 91)
  assert.equal(plan.librarySummary.total, 91)
  assert.equal(plan.librarySummary.counts.dinner, 31)
  const storedMeal = plan.library.find(meal => meal.id === created.id)
  assert.equal(storedMeal.name, 'Steak and Loaded Mashed Potatoes')
  assert.deepEqual(storedMeal.ingredients, ['Ribeye steak','Russet potatoes','Butter'])
  assert.equal(storedMeal.cookMinutes, 30)
  assert.equal(storedMeal.totalMinutes, 75)
})

test('custom meal creation generates its image once before the shared record is committed', async () => {
  const store=memoryStore()
  const repository=createMealPlanRepository({store,createId:()=> 'generated-image-id'})
  let calls=0
  const meal=await repository.createMeal({actor:'Larry',generateImage:async(candidate,assetId)=>{
    calls+=1
    assert.equal(candidate.name,'Salmon, Rice, and Broccoli')
    assert.equal(assetId,'custom-dinner-generated-image-id')
    return '/.netlify/functions/meal-images?id=custom-dinner-generated-image-id'
  },meal:{mealType:'dinner',name:'Salmon, Rice, and Broccoli',ingredients:['salmon','rice','broccoli'],prepMinutes:10,cookMinutes:20,macros:{calories:600,proteinGrams:45,carbohydrateGrams:55,fatGrams:20}}})
  assert.equal(calls,1)
  assert.equal(meal.image,'/.netlify/functions/meal-images?id=custom-dinner-generated-image-id')
  assert.equal((await repository.getLibrary()).customMeals[0].image,meal.image)
})

test('custom meals retain calculated batch, yield and ingredient nutrition evidence', async () => {
  const store=memoryStore()
  const repository=createMealPlanRepository({store,now:()=>new Date('2026-09-12T10:00:00Z'),createId:()=> 'nutrition-id'})
  const meal=await repository.createMeal({actor:'Larry',meal:{
    mealType:'breakfast',name:'Twelve Pancakes',prepMinutes:10,cookMinutes:20,
    ingredients:['2 cups pancake mix','1 cup water','1 stick butter'],
    serving:'1 pancake',yieldQuantity:12,yieldUnit:'pancakes',
    macros:{calories:168,proteinGrams:2,carbohydrateGrams:21,fatGrams:8},
    batchMacros:{calories:2010,proteinGrams:25,carbohydrateGrams:252,fatGrams:98},
    ingredientNutrition:[{input:'2 cups pancake mix',resolvedName:'Pancake mix',basis:'Package-label equivalent',confidence:'medium',macros:{calories:1200,proteinGrams:24,carbohydrateGrams:252,fatGrams:6}}],
    nutritionWarnings:['Confirm the exact package label.'],nutritionBasis:'Calculated by Brevity from the measured ingredient list.',
    sourceUrl:'https://recipes.example.com/pancakes',sourceName:'recipes.example.com',
  }})
  assert.equal(meal.yieldQuantity,12)
  assert.equal(meal.yieldUnit,'pancakes')
  assert.deepEqual(meal.batchMacros,{calories:2010,proteinGrams:25,carbohydrateGrams:252,fatGrams:98})
  assert.equal(meal.ingredientNutrition[0].resolvedName,'Pancake mix')
  assert.deepEqual(meal.nutritionWarnings,['Confirm the exact package label.'])
  assert.equal(meal.sourceUrl,'https://recipes.example.com/pancakes')
  assert.equal(meal.sourceName,'recipes.example.com')
})

test('duplicate custom meal names in the same meal type are rejected', async () => {
  const store = memoryStore()
  let sequence = 0
  const repository = createMealPlanRepository({ store, createId:() => `meal-${++sequence}` })
  const meal = { mealType:'dinner', name:'Steak Dinner', prepMinutes:30, macros:{ calories:600, proteinGrams:50, carbohydrateGrams:30, fatGrams:28 } }
  await repository.createMeal({ meal, actor:'Larry' })
  await assert.rejects(repository.createMeal({ meal:{...meal,name:' steak dinner '}, actor:'Larry' }), error => error.code === 'VALIDATION_ERROR')
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
