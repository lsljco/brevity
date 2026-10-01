export const MACRO_FIELDS = ['calories','proteinGrams','carbohydrateGrams','fatGrams']
const round = value => Math.round(value * 10) / 10
const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
export function mealTotals(meals) {
  const values = Object.values(meals || {}).filter(Boolean)
  return Object.fromEntries(MACRO_FIELDS.map(key => [key, values.every(meal => valid(meal.macros?.[key]))
    ? round(values.reduce((sum, meal) => sum + meal.macros[key], 0)) : null]))
}
export function personalMealPlan(meals, targets = {}) {
  const main = Object.fromEntries(['breakfast','lunch','dinner'].map(key => [key, meals?.[key]]))
  const mainTotals = mealTotals(main)
  const snacks = mealTotals({snack1:meals?.snack1,snack2:meals?.snack2})
  const complete = ['breakfast','lunch','dinner','snack1','snack2'].every(slot=>meals?.[slot]) && MACRO_FIELDS.every(key => mainTotals[key] != null && snacks[key] != null)
  const usable = key => valid(targets[key]) && targets[key] > 0
  let factor = 1
  if (complete && usable('proteinGrams') && mainTotals.proteinGrams > 0) {
    factor = (targets.proteinGrams - snacks.proteinGrams) / mainTotals.proteinGrams
    // Fixed snacks, bounded plate sizes. Do not fill protein by silently exceeding
    // the member's other saved targets. Any remaining gap is shown explicitly.
    for (const key of ['calories','carbohydrateGrams','fatGrams']) {
      if (usable(key) && mainTotals[key] > 0) factor = Math.min(factor, (targets[key] - snacks[key]) / mainTotals[key])
    }
    factor = Math.max(0.5, Math.min(2, factor))
    factor = Math.floor(factor * 100) / 100
  }
  const planned = Object.fromEntries(Object.entries(meals || {}).map(([slot, meal]) => {
    if (!meal) return [slot, meal]
    const multiplier = slot.startsWith('snack') ? 1 : factor
    return [slot, {...meal, portionMultiplier:multiplier, baseServing:meal.serving,
      macros:Object.fromEntries(MACRO_FIELDS.map(key => [key, valid(meal.macros?.[key]) ? round(meal.macros[key] * multiplier) : null]))}]
  }))
  return {meals:planned, totals:mealTotals(planned), factor, complete}
}

export function scaledIngredient(text, multiplier) {
  const match = String(text).match(/^(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s+(.+)$/)
  if (!match) return `${text} (scale with the plate)`
  const amount = match[1].split(/\s+/).reduce((sum, part) => {
    const [a,b] = part.split('/').map(Number)
    return sum + (b ? a / b : a)
  }, 0)
  return `${round(amount * multiplier)} ${match[2]}`
}
