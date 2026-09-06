const mealsIn = days => (Array.isArray(days) ? days : []).flatMap(day => Object.values(day?.resolvedMeals || {}).filter(Boolean))

export function summarizeMealPlan(days) {
  const meals = mealsIn(days)
  if (!meals.length) return null
  const totalPrepMinutes = meals.reduce((sum, meal) => sum + Number(meal.prepMinutes || 0), 0)
  const averageProteinGrams = Math.round(meals.reduce((sum, meal) => sum + Number(meal.macros?.proteinGrams || 0), 0) / meals.length)
  const longestPrep = [...meals].sort((left, right) => Number(right.prepMinutes || 0) - Number(left.prepMinutes || 0))[0]
  const tomorrow = days?.[1]
  return { mealCount:meals.length, totalPrepMinutes, averageProteinGrams, longestPrep, tomorrowDinner:tomorrow?.resolvedMeals?.dinner, tomorrowDate:tomorrow?.date || '' }
}
