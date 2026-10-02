// Library categories are separate from the five scheduled meal slots.
export const MEAL_CATEGORIES = ['breakfast', 'lunch', 'dinner', 'snack1', 'ingredient']
export const MEAL_CATEGORY_LABELS = {breakfast:'Breakfast', lunch:'Lunch', dinner:'Dinner', snack1:'Snack', ingredient:'Ingredient'}
export const mealCategory = type => type === 'snack2' ? 'snack1' : type
export const mealCategoryLabel = type => MEAL_CATEGORY_LABELS[mealCategory(type)] || 'Meal'
