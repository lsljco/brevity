export const LABEL_MACROS = [['calories','Calories'],['proteinGrams','Protein (g)'],['carbohydrateGrams','Carbs (g)'],['fatGrams','Fat (g)']]

export function packagedFoodInput(form) {
  const name = String(form.name || '').trim()
  const serving = String(form.serving || '').trim()
  if (!name || !serving) throw new Error('Enter the product name, flavor and label serving size.')
  if (!['breakfast','lunch','dinner','snack1','snack2'].includes(form.mealType)) throw new Error('Choose a meal or snack type.')
  const macros = Object.fromEntries(LABEL_MACROS.map(([key]) => {
    const raw = form[key]
    const value = Number(raw)
    if (raw == null || String(raw).trim() === '' || !Number.isFinite(value) || value < 0) throw new Error('Enter all four nutrition-label values; use 0 only when the label says zero.')
    return [key, value]
  }))
  return {mealType:form.mealType,name,description:'Packaged food · nutrition per label serving',serving,
    ingredients:[`${serving} ${name}`],instructions:['Use the serving size and preparation directions on the package.'],
    prepMinutes:0,cookMinutes:0,totalMinutes:0,yieldQuantity:1,yieldUnit:'label serving',
    macros,batchMacros:{...macros},ingredientNutrition:[],nutritionWarnings:form.nutritionWarnings||[],
    nutritionBasis:'Nutrition per stated label serving, reviewed by the household. Verify the exact product, flavor and package size.',
    sourceName:form.sourceName||'Package nutrition label',sourceUrl:form.sourceUrl||''}
}
