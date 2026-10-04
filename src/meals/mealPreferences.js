export const MEAL_SEASONS = ['Spring', 'Summer', 'Fall', 'Winter']
export function normalizeMealPreferences(value) {
  if (!value || typeof value !== 'object' || Object.keys(value).some(key => !['favorite', 'seasons'].includes(key)) || !Object.keys(value).length) throw new Error('Choose favorite or seasonal labels.')
  const result = {}
  if ('favorite' in value) {
    if (typeof value.favorite !== 'boolean') throw new Error('Favorite must be true or false.')
    result.favorite = value.favorite
  }
  if ('seasons' in value) {
    if (!Array.isArray(value.seasons) || value.seasons.length > 4 || value.seasons.some(season => !MEAL_SEASONS.includes(season))) throw new Error('Choose Spring, Summer, Fall, or Winter.')
    result.seasons = MEAL_SEASONS.filter(season => value.seasons.includes(season))
  }
  return result
}
