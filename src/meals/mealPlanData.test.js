import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fallbackMealImage, MEAL_LIBRARY, MEAL_TYPES, mealsForType } from './mealLibrary.js'
import { addMealDays, createRollingMealDay, mealDateInTimeZone, mealLibrarySummary, resolveMealDay, rollingMealDates, rotatingMealForDate, validateMealSubstitution } from './mealPlanData.js'

test('meal library includes the core rotation and every distinct Fuel with Purpose meal', () => {
  assert.deepEqual(mealLibrarySummary(), { total: 117, counts: { breakfast: 37, lunch: 40, dinner: 40 } })
  assert.equal(new Set(MEAL_LIBRARY.map(meal => meal.id)).size, 117)
  assert.equal(MEAL_LIBRARY.filter(meal => meal.tags.includes('fuel-with-purpose')).length, 27)
})

test('every meal has a project image and complete estimated macros', () => {
  for (const meal of MEAL_LIBRARY) {
    assert.match(meal.image, /^\/meal-images\/(?:breakfast|lunch|dinner|fuel)-[a-z0-9-]+\.webp$/)
    assert.equal(existsSync(fileURLToPath(new URL(`../../public${meal.image}`, import.meta.url))), true, `${meal.id} image`)
    assert.ok(meal.serving)
    for (const field of ['calories', 'proteinGrams', 'carbohydrateGrams', 'fatGrams']) {
      assert.equal(Number.isInteger(meal.macros[field]), true, `${meal.id} ${field}`)
      assert.ok(meal.macros[field] >= 0, `${meal.id} ${field}`)
    }
  }
})

test('legacy custom meals receive the closest relevant library image without replacing an existing image', () => {
  const legacy = { mealType:'dinner', name:'Salmon, rice, and broccoli', description:'Salmon, Rice, and Broccoli Meal', ingredients:['salmon','rice','broccoli'], image:'' }
  assert.equal(fallbackMealImage(legacy), '/meal-images/dinner-02.webp')
  assert.equal(fallbackMealImage({ ...legacy, image:'/custom.png' }), '/custom.png')
  assert.equal(fallbackMealImage({ mealType:'dinner', name:'Completely Unknown', image:'' }), '')
})

test('breakfast library excludes the heavy American breakfast foods the household rejected', () => {
  const breakfastText = JSON.stringify(mealsForType('breakfast')).toLowerCase()
  for (const rejected of ['bacon', 'sausage', 'pancake', 'waffle']) assert.equal(breakfastText.includes(rejected), false)
})

test('lunch and dinner defaults are simple protein-and-vegetable meals', () => {
  for (const mealType of ['lunch', 'dinner']) {
    const coreMeals = mealsForType(mealType).filter(meal => meal.tags.includes('protein-and-vegetable'))
    assert.equal(coreMeals.length, 30)
    assert.ok(coreMeals.every(meal => meal.name.includes('+')))
  }
})

test('Fuel with Purpose imports preserve source details without inventing recipes or timing', () => {
  const imported = MEAL_LIBRARY.filter(meal => meal.tags.includes('fuel-with-purpose'))
  assert.equal(imported.length, 27)
  assert.ok(imported.every(meal => meal.ingredients.length > 0))
  assert.ok(imported.every(meal => meal.instructions.length === 0))
  assert.ok(imported.every(meal => meal.timingRecorded === false))
  assert.ok(imported.every(meal => /Week 9\.16\.26/.test(meal.sourceName)))
  assert.ok(imported.some(meal => meal.name === 'Chicken Chipotle Bowl' && meal.serving === '1 entire bowl'))
  assert.ok(imported.some(meal => meal.name === 'Lean Beef Spaghetti' && meal.serving === 'approximately 2 cups'))
})

test('rolling dates and rotation provide seven stable days without category repeats', () => {
  const dates = rollingMealDates('2026-08-24')
  assert.deepEqual(dates, ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30'])
  for (const mealType of MEAL_TYPES) assert.equal(new Set(dates.map(date => rotatingMealForDate(date, mealType).id)).size, 7)
  assert.equal(addMealDays('2026-12-31', 1), '2027-01-01')
})

test('meal day resolves library records and validates same-category substitutions', () => {
  const day = createRollingMealDay('2026-08-24', { householdId: 'household-1', now: '2026-08-24T12:00:00.000Z' })
  assert.equal(day.version, 1)
  assert.equal(resolveMealDay(day).resolvedMeals.breakfast.mealType, 'breakfast')
  assert.deepEqual(validateMealSubstitution({ date: day.date, mealType: 'dinner', mealId: 'dinner-01' }), [])
  assert.ok(validateMealSubstitution({ date: day.date, mealType: 'dinner', mealId: 'breakfast-01' }).length)
})

test('household date uses the configured time zone instead of server UTC', () => {
  assert.equal(mealDateInTimeZone(new Date('2026-08-24T02:30:00.000Z'), 'America/New_York'), '2026-08-23')
})
