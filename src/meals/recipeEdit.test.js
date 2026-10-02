import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeRecipeEdit,resizeRecipeServing} from './recipeEdit.js'
import {applyRecipeUpdate} from '../../netlify/lib/recipe-library-actions.mjs'
import {normalizeActionProposal} from '../../netlify/lib/assistant-action-contract.mjs'
const recipe={description:'Shake',serving:'1 bottle',yieldQuantity:1,yieldUnit:'bottles',ingredients:['1 protein shake'],instructions:['Serve chilled'],prepMinutes:1,cookMinutes:0,macros:{calories:160,proteinGrams:30,carbohydrateGrams:4,fatGrams:3}}
test('serving resize keeps batch nutrition constant and scales all macros',()=>{
 const changed=resizeRecipeServing(recipe,1.5)
 assert.equal(changed.macros.proteinGrams,45);assert.equal(changed.macros.calories,240);assert.equal(changed.yieldQuantity,2/3)
 assert.equal(changed.macros.proteinGrams*changed.yieldQuantity,30)
 assert.deepEqual(changed.ingredients,recipe.ingredients)
 assert.throws(()=>resizeRecipeServing(recipe,0),/greater than zero/)
})
test('recipe edit validates strict fields, numeric macros and positive yields',()=>{
 assert.deepEqual(normalizeRecipeEdit(recipe),recipe)
 for(const bad of [{...recipe,id:'another'},{...recipe,yieldQuantity:0},{...recipe,macros:{...recipe.macros,proteinGrams:-1}},{...recipe,macros:{...recipe.macros,calories:NaN}}])assert.throws(()=>normalizeRecipeEdit(bad))
})
test('reviewed full recipe update preserves identity and recomputes batch totals',()=>{
 const edit=resizeRecipeServing(recipe,2),payload={name:'Two shakes',recipeJson:JSON.stringify(edit)}
 const operation=normalizeActionProposal({operations:[{type:'meal.recipe.update',targetId:'exact-recipe',payload}]},{member:'Larry',role:'admin'}).operations[0]
 const original={id:'exact-recipe',name:'Shake',...recipe}
 const saved=applyRecipeUpdate({meals:[original]},operation,{actor:'Larry',now:()=>new Date('2026-10-01')})
 assert.equal(saved.overrides['exact-recipe'].name,'Two shakes')
 assert.equal(saved.overrides['exact-recipe'].macros.proteinGrams,60)
 assert.equal(saved.overrides['exact-recipe'].batchMacros.proteinGrams,30)
 assert.deepEqual(saved.meals,[original]);assert.deepEqual(saved.overrides['exact-recipe'].ingredientNutrition,[])
 assert.throws(()=>normalizeActionProposal({operations:[{type:'meal.recipe.update',targetId:'exact-recipe',payload:{...payload,estimateJson:'{}'}}]},{member:'Larry',role:'admin'}))
})

test('meal category edits preserve the recipe identity, nutrition and existing plan references',()=>{
 const original={id:'shake',name:'Shake',mealType:'breakfast',...recipe}
 for(const mealType of ['breakfast','lunch','dinner','snack1','ingredient']){
  const operation=normalizeActionProposal({operations:[{type:'meal.recipe.update',targetId:'shake',payload:{name:'Shake',recipeJson:JSON.stringify({...recipe,mealType})}}]},{member:'Larry',role:'admin'}).operations[0]
  const saved=applyRecipeUpdate({meals:[original]},operation,{actor:'Larry',now:()=>new Date('2026-10-02')})
  assert.equal(saved.overrides.shake.mealType,mealType)
  assert.deepEqual(saved.overrides.shake.macros,recipe.macros)
  assert.equal(saved.overrides.shake.nutritionBasis,undefined)
  assert.deepEqual(saved.meals,[original])
 }
 assert.throws(()=>normalizeRecipeEdit({...recipe,mealType:'brunch'}),/Choose Breakfast/)
})
