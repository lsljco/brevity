// Library categories are separate from the five scheduled meal slots.
export const MEAL_CATEGORIES = ['breakfast', 'lunch', 'dinner', 'snack1', 'ingredient', 'meal', 'side']
export const MEAL_CATEGORY_LABELS = {breakfast:'Breakfast', lunch:'Lunch', dinner:'Dinner', snack1:'Snack', ingredient:'Ingredient',meal:'Complete meal',side:'Side'}
export const mealCategory = type => type === 'snack2' ? 'snack1' : type
export const mealCategoryLabel = type => MEAL_CATEGORY_LABELS[mealCategory(type)] || 'Meal'

export const LIBRARY_CATEGORIES=['meal','side','ingredient']
export const LIBRARY_CATEGORY_LABELS={meal:'Complete meals',side:'Sides',ingredient:'Individual foods / ingredients'}
export const libraryCategory=meal=>meal?.mealType==='side'?'side':['ingredient','snack1','snack2'].includes(meal?.mealType)?'ingredient':'meal'
export const libraryCategoryLabel=meal=>LIBRARY_CATEGORY_LABELS[libraryCategory(meal)]
export const mealReadyForPlanning=meal=>!meal?.importSource||(['calories','proteinGrams','carbohydrateGrams','fatGrams'].every(k=>typeof meal.macros?.[k]==='number'&&Number.isFinite(meal.macros[k])&&meal.macros[k]>=0)&&meal.ingredients?.length>0&&meal.instructions?.length>0&&Number(meal.yieldQuantity)>0&&!meal.importReviewRequired)
