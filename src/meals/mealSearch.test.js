import assert from 'node:assert/strict'
import test from 'node:test'
import { searchMeals } from './mealSearch.js'

const meals = [
  { id:'breakfast', name:'Morning plate', description:'A hearty breakfast', ingredients:['6 oz sirloin steak', '2 large eggs'] },
  { id:'dinner', name:'Steak and asparagus', description:'Grilled beef', ingredients:['Ribeye steak', 'Asparagus'] },
  { id:'lunch', name:'Egg salad', description:'Quick lunch', ingredients:['Eggs', 'Mustard'] },
]

test('searches names, descriptions, and ingredient lines with all meaningful terms', () => {
  assert.deepEqual(searchMeals(meals, 'steak').map(meal => meal.id), ['breakfast', 'dinner'])
  assert.deepEqual(searchMeals(meals, 'steak and eggs').map(meal => meal.id), ['breakfast'])
  assert.deepEqual(searchMeals(meals, 'HEARTY eggs').map(meal => meal.id), ['breakfast'])
  assert.deepEqual(searchMeals(meals, 'steak salmon'), [])
  assert.equal(searchMeals(meals, '  '), meals)
})
