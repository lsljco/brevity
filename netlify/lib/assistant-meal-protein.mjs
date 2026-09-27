const proteinQuestion = query => /\bprotein\b/i.test(query) && /\b(meals?|breakfast|lunch|dinner|eat|eating)\b/i.test(query) && /\b(today|daily|day)\b/i.test(query)

export function answerTodayMealProtein(query, context) {
  if (!proteinQuestion(query)) return null
  const date = context.householdDate
  const source = context.sources?.find(item => item.id === 'rolling-meals')
  if (source?.state !== 'available' || !context.rollingMealPlan) {
    return `I can't verify the meal plan for ${date} right now. Please refresh the Meal Plan and try again.`
  }
  const day = context.rollingMealPlan.days?.find(item => item.date === date)
  if (!day) return `I don't have a saved meal plan for ${date}, so I can't calculate its protein total.`
  const meals = ['breakfast', 'lunch', 'dinner'].map(type => ({ type, meal: day.meals?.[type] })).filter(item => item.meal)
  if (!meals.length) return `No meals are scheduled for ${date}, so I can't calculate a planned protein total.`
  const known = meals.filter(({meal}) => Number.isFinite(Number(meal.macros?.proteinGrams)))
  const total = known.reduce((sum, {meal}) => sum + Number(meal.macros.proteinGrams), 0)
  const lines = meals.map(({type,meal}) => `- ${type[0].toUpperCase() + type.slice(1)}: ${meal.name || 'Unnamed meal'} — ${Number.isFinite(Number(meal.macros?.proteinGrams)) ? `${Number(meal.macros.proteinGrams)} g` : 'protein not recorded'}`)
  const target = Number(context.dailyPlan?.health?.proteinGoalGrams ?? context.dailyPlan?.nutrition?.proteinGoalGrams)
  const hasTarget = Number.isFinite(target) && target > 0
  const comparison = hasTarget && known.length === meals.length && meals.length === 3
    ? `Your saved goal is ${target} g, so this plan is ${total >= target ? `${total - target} g above` : `${target - total} g short of`} your goal.`
    : hasTarget ? `Your saved goal is ${target} g, but I can't determine whether the full plan meets it until all three meals have protein values.`
      : 'I do not see a saved daily protein goal, so I cannot say whether this meets your target. Tell me your goal in grams to compare it.'
  return `For ${date}, the scheduled meals show:\n${lines.join('\n')}\n\n${known.length ? `Recorded protein totals ${total} g${known.length < meals.length ? ' across the meals with macros' : ''}. ` : ''}${comparison} These are estimated macros per saved meal serving; actual portions and optional sides may change the total.`
}
