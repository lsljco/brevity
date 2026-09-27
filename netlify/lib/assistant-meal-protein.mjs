const proteinQuestion = query => /\bprotein\b/i.test(query) && /\b(meals?|breakfast|lunch|dinner|eat|eating)\b/i.test(query) && /\b(today|daily|day)\b/i.test(query)
const followup = query => /\b(goal|target|protein|meals?|additional|additionally|difference|short|more|answer|respond)\b/i.test(query)
const statedGoal = query => {
  const match = String(query).match(/\b(?:my\s+)?(?:protein\s+)?(?:goal|target)\s+(?:is|of|:|=)?\s*(\d{2,3})\s*(?:g|grams)?\b/i)
    || String(query).match(/\b(\d{2,3})\s*(?:g|grams)\s+(?:of\s+)?protein\b/i)
  return match ? Number(match[1]) : null
}

export function mealProteinFocus(messages, context) {
  const users = messages.filter(item => item.role === 'user').slice(-5)
  const latest = String(users.at(-1)?.content || '')
  if (!proteinQuestion(latest) && !(users.some(item => proteinQuestion(item.content)) && followup(latest))) return null
  const statedProteinGoalGrams = [...users].reverse().map(item => statedGoal(item.content)).find(value => value != null) ?? null
  const savedProteinGoalGrams = context.dailyPlan?.health?.proteinGoalGrams ?? context.dailyPlan?.nutrition?.proteinGoalGrams ?? null
  const goalGrams = statedProteinGoalGrams ?? savedProteinGoalGrams
  const date = context.householdDate
  const source = context.sources?.find(item => item.id === 'rolling-meals')
  const day = context.rollingMealPlan?.days?.find(item => item.date === date)
  const meals = ['breakfast','lunch','dinner'].map(type => {
    const meal = day?.meals?.[type]
    return {type,scheduled:Boolean(meal),name:meal?.name || null,proteinGrams:meal?.macros?.proteinGrams ?? null,macroBasis:meal?.macroBasis || null}
  })
  const complete = meals.every(meal => meal.scheduled && meal.proteinGrams != null && Number.isFinite(Number(meal.proteinGrams)))
  const recordedTotalGrams = meals.reduce((sum,meal) => sum + (meal.proteinGrams == null ? 0 : Number(meal.proteinGrams)),0)
  return {
    topic:'today-meal-protein',date,mealSourceState:source?.state || 'missing',mealSourceAsOf:source?.asOf || null,
    meals:source?.state === 'available' ? meals : [],complete,
    recordedTotalGrams:source?.state === 'available' ? recordedTotalGrams : null,
    goalGrams,goalSource:statedProteinGoalGrams != null ? 'member-stated in conversation' : savedProteinGoalGrams != null ? 'saved daily plan' : 'not recorded',
    differenceGrams:complete && Number(goalGrams) > 0 ? Number(goalGrams) - recordedTotalGrams : null,
    nutritionNotice:'Saved meal macros are estimates per serving. Do not assume an extra portion or food was eaten or added to the plan.'
  }
}
