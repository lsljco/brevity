const mealsIn = day => Object.values(day?.resolvedMeals || {}).filter(Boolean)
const numeric = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function summarizeMealPlan(days, selectedDate = '') {
  const selectedDay = (Array.isArray(days) ? days : []).find(day => day?.date === selectedDate) || days?.[0]
  const meals = mealsIn(selectedDay)
  if (!meals.length) return null

  const totals = meals.reduce((summary, meal) => ({
    prepMinutes: summary.prepMinutes + numeric(meal.totalMinutes ?? meal.prepMinutes),
    calories: summary.calories + numeric(meal.macros?.calories),
    proteinGrams: summary.proteinGrams + numeric(meal.macros?.proteinGrams),
    carbohydrateGrams: summary.carbohydrateGrams + numeric(meal.macros?.carbohydrateGrams),
    fatGrams: summary.fatGrams + numeric(meal.macros?.fatGrams),
  }), { prepMinutes:0, calories:0, proteinGrams:0, carbohydrateGrams:0, fatGrams:0 })

  const averageProteinGrams = Math.round(totals.proteinGrams / meals.length)
  const longestPrep = [...meals].sort((left, right) => numeric(right.totalMinutes ?? right.prepMinutes) - numeric(left.totalMinutes ?? left.prepMinutes))[0]
  const tomorrow = days?.[1]

  return {
    mealCount: meals.length,
    selectedDate:selectedDay?.date || '',
    totalPrepMinutes: totals.prepMinutes,
    totalCalories: Math.round(totals.calories),
    totalProteinGrams: Math.round(totals.proteinGrams),
    totalCarbohydrateGrams: Math.round(totals.carbohydrateGrams),
    totalFatGrams: Math.round(totals.fatGrams),
    averageProteinGrams,
    longestPrep:{...longestPrep,prepMinutes:numeric(longestPrep.totalMinutes ?? longestPrep.prepMinutes)},
    tomorrowDinner: tomorrow?.resolvedMeals?.dinner,
    tomorrowDate: tomorrow?.date || '',
  }
}
