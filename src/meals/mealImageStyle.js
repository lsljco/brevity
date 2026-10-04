export function isBrevityMealImage(meal) {
 if(!meal?.image||meal.imageFallback||meal.imageOrigin==='uploaded')return false
 return meal.imageOrigin==='generated'||/^\/meal-images\//.test(meal.image)||/^\/\.netlify\/functions\/meal-images\?/.test(meal.image)
}
