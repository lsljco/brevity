import {MEAL_LIBRARY} from '../../src/meals/mealLibrary.js'
export const RECIPE_RESOURCE='meal-library:recipes'
export function resolvedRecipes(value={}){
  return [...MEAL_LIBRARY,...(value?.meals||[])].map(meal=>({...meal,...(value?.overrides?.[meal.id]||{}),id:meal.id}))
}
const words=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean)
export function searchMealRecords(query,{library=[],recentNutrition=[],rollingMealPlan}={}){
  const tokens=words(query),score=item=>tokens.reduce((sum,token)=>sum+(words(item.name).includes(token)?2:words(JSON.stringify(item.ingredients||[])).includes(token)?1:0),0)
  const candidates=[...library.map(item=>({...item,kind:'recipe'})),...recentNutrition.flatMap(day=>day.entries.map(item=>({...item,kind:'consumed',date:day.date}))),...(rollingMealPlan?.days||[]).flatMap(day=>Object.entries(day.meals||{}).filter(([,meal])=>meal&&typeof meal==='object').map(([mealType,meal])=>({...meal,kind:'planned',date:day.date,mealType}))) ]
  return candidates.map(item=>({item,score:score(item)})).filter(row=>!tokens.length||row.score>0).sort((a,b)=>b.score-a.score).slice(0,12).map(({item})=>({kind:item.kind,id:item.id,name:item.name,date:item.date,mealType:item.mealType,ingredients:item.ingredients,macros:item.macros,serving:item.serving,yieldQuantity:item.yieldQuantity,yieldUnit:item.yieldUnit,instructions:item.instructions}))
}
export function bindRecipeOperation(operation,{library,estimates}){
  if(operation.type!=='meal.recipe.update')return operation
  const meal=library.find(item=>item.id===operation.targetId),data=JSON.parse(operation.payloadJson||'{}')
  if(!meal||!data.name||Object.keys(data).some(key=>!['name','estimateId'].includes(key)))throw new Error('Find the saved recipe before preparing its edit.')
  const estimate=data.estimateId?estimates.get(data.estimateId):null
  if(data.estimateId&&!estimate)throw new Error('Recalculate the updated recipe before reviewing its ingredients.')
  return {...operation,payloadJson:JSON.stringify({name:data.name,...(estimate?{estimateJson:JSON.stringify(estimate)}:{})})}
}
export function applyRecipeUpdate(value,operation,{actor,now}){
  const meal=resolvedRecipes(value).find(item=>item.id===operation.targetId)
  if(!meal)throw new Error('That recipe is no longer in the household library.')
  const patch={name:operation.payload.name,updatedBy:actor,updatedAt:now().toISOString()}
  if(operation.payload.estimateJson){
    const estimate=JSON.parse(operation.payload.estimateJson)
    Object.assign(patch,{ingredients:estimate.ingredients.map(item=>item.input),ingredientNutrition:estimate.ingredients,macros:estimate.perServingMacros,batchMacros:estimate.batchMacros,yieldQuantity:estimate.yieldQuantity,yieldUnit:estimate.yieldUnit,serving:estimate.serving,nutritionWarnings:estimate.warnings,nutritionBasis:estimate.nutritionBasis})
  }
  return {...value,overrides:{...(value?.overrides||{}),[meal.id]:{...(value?.overrides?.[meal.id]||{}),...patch}}}

}
