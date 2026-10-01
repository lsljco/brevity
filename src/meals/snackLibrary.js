// Explicit food IDs and declared serving bases; never infer nutrition from names.
const snack = (id, mealType, name, serving, macros, sourceUrl, nutritionBasis) => Object.freeze({
  id, mealType, name, serving, macros, sourceUrl, nutritionBasis,
  description: serving, prepMinutes: 1, cookMinutes: 0, totalMinutes: 1,
  image: '', ingredients: [serving], instructions: ['Serve the listed portion.'],
  yieldQuantity: 1, yieldUnit: 'serving', tags: ['snack'],
})
export const SNACK_LIBRARY = Object.freeze([
  snack('snack-premier-chocolate','snack1','Premier Protein Shake — Chocolate','1 shake (11 fl oz)',
    {calories:160,proteinGrams:30,carbohydrateGrams:4,fatGrams:3},
    'https://www.premierprotein.com/products/chocolate-protein-shake',
    'Premier Protein chocolate 30 g shake label. Other flavors and products may differ; swap to the correct saved food.'),
  snack('snack-envy-apple','snack2','Envy apple','1 medium apple (182 g)',
    {calories:95,proteinGrams:0.5,carbohydrateGrams:25,fatGrams:0.3},
    'https://www.cks.k12.hi.us/ourpages/auto/2018/7/26/54146769/Envy_Apple.pdf',
    'Estimated for a medium 182 g apple with skin; actual apple size varies.'),
])
