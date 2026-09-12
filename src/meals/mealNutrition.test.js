import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { calculateMealNutrition, calculateNutritionResult, normalizeNutritionRequest } from '../../netlify/lib/meal-nutrition.mjs'

const ingredients=[
  {input:'ignored',resolvedName:'Pearl Milling Company Original Pancake Mix',amountDescription:'2 cups dry mix',calories:1200,proteinGrams:24,carbohydrateGrams:252,fatGrams:6,basis:'Package-label equivalent',confidence:'medium'},
  {input:'ignored',resolvedName:'Water',amountDescription:'1 cup',calories:0,proteinGrams:0,carbohydrateGrams:0,fatGrams:0,basis:'Water',confidence:'high'},
  {input:'ignored',resolvedName:'Salted butter',amountDescription:'1 stick',calories:810,proteinGrams:1,carbohydrateGrams:0,fatGrams:92,basis:'USDA standard portion',confidence:'high'},
]

test('nutrition calculation totals the entire recipe and divides by the declared yield', () => {
  const result=calculateNutritionResult({ingredients:['2 cups pancake mix','1 cup water','1 stick butter'],yieldQuantity:12,yieldUnit:'pancakes'},{ingredients,warnings:['Confirm the exact pancake-mix package label.']})
  assert.deepEqual(result.batchMacros,{calories:2010,proteinGrams:25,carbohydrateGrams:252,fatGrams:98})
  assert.deepEqual(result.perServingMacros,{calories:167.5,proteinGrams:2.1,carbohydrateGrams:21,fatGrams:8.2})
  assert.equal(result.serving,'1 pancake')
  assert.equal(result.ingredients[0].input,'2 cups pancake mix')
  assert.match(result.nutritionBasis,/measured ingredient list/i)
})

test('nutrition requests require measured ingredients and a usable batch yield', () => {
  assert.throws(()=>normalizeNutritionRequest({ingredients:[],yieldQuantity:12,yieldUnit:'pancakes'}),/ingredient/i)
  assert.throws(()=>normalizeNutritionRequest({ingredients:['mix'],yieldQuantity:0,yieldUnit:'pancakes'}),/yield/i)
  assert.throws(()=>normalizeNutritionRequest({ingredients:['mix'],yieldQuantity:12,yieldUnit:''}),/yield unit/i)
})

test('nutrition model receives a strict ingredient-level contract and arithmetic stays in Brevity', async () => {
  const priorKey=process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY='test-key'
  let requestBody
  try{
    const result=await calculateMealNutrition({ingredients:['2 cups pancake mix','1 cup water','1 stick butter'],yieldQuantity:12,yieldUnit:'pancakes'},{fetcher:async(_url,options)=>{
      requestBody=JSON.parse(options.body)
      return{ok:true,status:200,json:async()=>({output_text:JSON.stringify({ingredients,warnings:[]})})}
    }})
    assert.equal(requestBody.store,false)
    assert.equal(requestBody.text.format.strict,true)
    assert.equal(requestBody.text.format.schema.properties.ingredients.maxItems,30)
    assert.deepEqual(result.batchMacros,{calories:2010,proteinGrams:25,carbohydrateGrams:252,fatGrams:98})
  }finally{
    if(priorKey===undefined)delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY=priorKey
  }
})

test('nutrition model calls are bounded and return a retryable timeout message',async()=>{
  const priorKey=process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY='test-key'
  try{
    await assert.rejects(
      calculateMealNutrition({ingredients:['1 cup oats'],yieldQuantity:1,yieldUnit:'serving'},{timeoutMs:1,fetcher:(_url,options)=>new Promise((resolve,reject)=>{
        options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})))
        void resolve
      })}),
      error=>error.status===504&&/too long/i.test(error.message),
    )
  }finally{
    if(priorKey===undefined)delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY=priorKey
  }
})

test('custom meal form derives macros from ingredients instead of asking the household to enter them', () => {
  const source=readFileSync(new URL('./MealPlanner.jsx',import.meta.url),'utf8')
  assert.match(source,/Measured ingredients/)
  assert.match(source,/Batch yield/)
  assert.match(source,/Calculate nutrition/)
  assert.match(source,/Total batch and per/)
  assert.doesNotMatch(source,/<span>Calories<\/span><input required/)
  assert.doesNotMatch(source,/<span>Protein \(g\)<\/span><input required/)
})
