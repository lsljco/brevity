import { MEAL_CATEGORIES, mealCategory } from '../../src/meals/mealCategories.js'

export const safeSegment = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-')
const numeric = value => {
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}
export const safeText = (value, maximum = 500) => String(value || '').trim().slice(0, maximum)
const normalizeIngredientNutrition = rows => (Array.isArray(rows) ? rows : []).slice(0, 30).map(row => ({
  input: safeText(row?.input, 240),
  resolvedName: safeText(row?.resolvedName, 240),
  amountDescription: safeText(row?.amountDescription, 240),
  basis: safeText(row?.basis, 500),
  confidence: ['high', 'medium', 'low'].includes(row?.confidence) ? row.confidence : 'low',
  macros: {
    calories: Math.round(numeric(row?.macros?.calories) || 0),
    proteinGrams: Math.round(numeric(row?.macros?.proteinGrams) || 0),
    carbohydrateGrams: Math.round(numeric(row?.macros?.carbohydrateGrams) || 0),
    fatGrams: Math.round(numeric(row?.macros?.fatGrams) || 0),
  },
}))

export function normalizeMealInput(meal, actor, now, createId) {
  const mealType = String(meal?.mealType || '').toLowerCase()
  const name = String(meal?.name || '').trim()
  const prepMinutes = numeric(meal?.prepMinutes)
  const cookMinutes = numeric(meal?.cookMinutes ?? 0)
  const suppliedTotalMinutes = meal?.totalMinutes === undefined || meal?.totalMinutes === '' ? null : numeric(meal.totalMinutes)
  const calories = numeric(meal?.macros?.calories)
  const proteinGrams = numeric(meal?.macros?.proteinGrams)
  const carbohydrateGrams = numeric(meal?.macros?.carbohydrateGrams)
  const fatGrams = numeric(meal?.macros?.fatGrams)
  const errors = []

  if (!MEAL_CATEGORIES.includes(mealCategory(mealType))) errors.push('Choose Breakfast, Lunch, Dinner, Snack, or Ingredient.')
  if (!name) errors.push('Meal name is required.')
  if (prepMinutes == null || cookMinutes == null || (meal?.totalMinutes !== undefined && meal?.totalMinutes !== '' && suppliedTotalMinutes == null)) errors.push('Prep, cook and total time must each be zero or greater.')
  if ([calories, proteinGrams, carbohydrateGrams, fatGrams].some(value => value == null)) errors.push('Calories, protein, carbs and fat must each be zero or greater.')
  if (errors.length) {
    const error = new Error(errors.join(' '))
    error.code = 'VALIDATION_ERROR'
    throw error
  }

  // Package labels can declare fractional grams; retain their supplied values.
  const macroValue = ['Package nutrition label','Open Food Facts'].includes(meal?.sourceName) ? value => value : Math.round
  const createdAt = now().toISOString()
  return {
    id: `custom-${mealType}-${safeSegment(createId())}`,
    custom: true,
    mealType,
    name,
    description: String(meal?.description || '').trim() || name,
    prepMinutes: Math.round(prepMinutes),
    cookMinutes: Math.round(cookMinutes),
    totalMinutes: Math.round(suppliedTotalMinutes == null ? prepMinutes + cookMinutes : suppliedTotalMinutes),
    timingRecorded: meal?.timingRecorded !== false,
    ingredients: (Array.isArray(meal?.ingredients) ? meal.ingredients : String(meal?.ingredients || '').split(/\r?\n/)).map(value => String(value || '').trim()).filter(Boolean),
    instructions: (Array.isArray(meal?.instructions) ? meal.instructions : String(meal?.instructions || '').split(/\r?\n/)).map(value => String(value || '').trim()).filter(Boolean).slice(0, 30),
    image: String(meal?.image || '').trim(),
    serving: String(meal?.serving || '').trim() || '1 serving',
    yieldQuantity: numeric(meal?.yieldQuantity),
    yieldUnit: String(meal?.yieldUnit || '').trim(),
    batchMacros: meal?.batchMacros ? {
      calories:macroValue(numeric(meal.batchMacros.calories) || 0),
      proteinGrams:macroValue(numeric(meal.batchMacros.proteinGrams) || 0),
      carbohydrateGrams:macroValue(numeric(meal.batchMacros.carbohydrateGrams) || 0),
      fatGrams:macroValue(numeric(meal.batchMacros.fatGrams) || 0),
    } : undefined,
    ingredientNutrition: normalizeIngredientNutrition(meal?.ingredientNutrition),
    nutritionWarnings: Array.isArray(meal?.nutritionWarnings) ? meal.nutritionWarnings.map(value=>String(value||'').trim()).filter(Boolean).slice(0,20) : [],
    nutritionBasis: String(meal?.nutritionBasis || '').trim() || 'Household-entered nutrition estimate',
    sourceUrl: safeText(meal?.sourceUrl, 2048),
    sourceName: safeText(meal?.sourceName, 160),
    macros: {
      calories: macroValue(calories),
      proteinGrams: macroValue(proteinGrams),
      carbohydrateGrams: macroValue(carbohydrateGrams),
      fatGrams: macroValue(fatGrams),
    },
    tags: ['household custom'],
    createdAt,
    createdBy: actor,
    updatedAt: createdAt,
    updatedBy: actor,
  }
}

