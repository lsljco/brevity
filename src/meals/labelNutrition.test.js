import test from 'node:test'
import assert from 'node:assert/strict'
import {calculateLabelNutrition} from '../../netlify/lib/label-nutrition.mjs'
const sausage={name:'Example sausage',servingSize:'2 oz',servings:3,calories:190,proteinGrams:6,carbohydrateGrams:2,fatGrams:17,sodiumMilligrams:500}
const shake={name:'Example shake',servingSize:'1 bottle',servings:1,calories:160,proteinGrams:30,carbohydrateGrams:5,fatGrams:3}
const toast={name:'Example bread',servingSize:'1 slice',servings:2,calories:70,proteinGrams:2,carbohydrateGrams:13,fatGrams:1}
test('label values scale per food and total without model estimates',()=>{
  const result=calculateLabelNutrition({labels:[sausage,shake,toast]})
  assert.deepEqual(result.perServingMacros,{calories:870,proteinGrams:52,carbohydrateGrams:37,fatGrams:56})
  assert.equal(result.ingredients[0].label.perLabelServing.proteinGrams,6)
  assert.equal(result.ingredients[0].label.servings,3)
  assert.equal(result.ingredients[0].source,'member-label')
  assert.equal(result.perServingNutrients.sodiumMilligrams,null)
  assert.match(result.warnings[0],/not independently verified/)
})
test('fractional servings and optional zero values remain distinct from unknown',()=>{
  const result=calculateLabelNutrition({labels:[{...sausage,servings:.5,fiberGrams:0,sugarGrams:''}]})
  assert.equal(result.perServingMacros.proteinGrams,3)
  assert.deepEqual(result.perServingNutrients,{fiberGrams:0,sugarGrams:null,sodiumMilligrams:250})
})
test('incomplete and malformed labels fail rather than silently becoming zero',()=>{
  for(const patch of [{proteinGrams:''},{calories:-1},{fatGrams:Infinity},{proteinGrams:true},{calories:[]},{servings:0},{servings:501},{servingSize:''},{name:''},{sodiumMilligrams:-2}]){
    assert.throws(()=>calculateLabelNutrition({labels:[{...sausage,...patch}]}),error=>error.code==='VALIDATION_ERROR')
  }
  for(const labels of [[],Array(31).fill(sausage),null,[null]])assert.throws(()=>calculateLabelNutrition({labels}),error=>error.status===400)
})
