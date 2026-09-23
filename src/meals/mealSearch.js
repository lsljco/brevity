const searchableText = meal => [meal.name, meal.description, ...(Array.isArray(meal.ingredients) ? meal.ingredients : [])]
  .filter(value => typeof value === 'string')
  .join(' ')
  .toLocaleLowerCase()

export function searchMeals(library, query) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(term => term && term !== 'and' && term !== '&')
  if (!terms.length) return library
  return library.filter(meal => {
    const text = searchableText(meal)
    return terms.every(term => text.includes(term))
  })
}
