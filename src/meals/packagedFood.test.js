import test from 'node:test'
import assert from 'node:assert/strict'
import {packagedFoodInput} from './packagedFood.js'
import {normalizeMealInput} from '../../netlify/lib/meal-input.mjs'
const form={mealType:'snack1',name:'Test brand — banana',serving:'1 bottle (325 mL)',calories:'160',proteinGrams:'30',carbohydrateGrams:'4.5',fatGrams:'3'}
test('packaged food saves label basis and serving without estimating ingredients',()=>{
 const meal=packagedFoodInput(form)
 assert.equal(meal.serving,form.serving)
 assert.equal(meal.macros.carbohydrateGrams,4.5)
 assert.deepEqual(meal.batchMacros,meal.macros)
 assert.equal(meal.yieldQuantity,1)
 assert.equal(meal.sourceName,'Package nutrition label')
 assert.equal(meal.prepMinutes,0)
 assert.equal(meal.date,undefined)
})
test('missing, negative and nonfinite label fields are rejected rather than counted as zero',()=>{
 for(const value of ['',null,undefined,'-1','NaN','Infinity']) assert.throws(()=>packagedFoodInput({...form,proteinGrams:value}))
 assert.equal(packagedFoodInput({...form,fatGrams:'0'}).macros.fatGrams,0)
 assert.throws(()=>packagedFoodInput({...form,serving:''}))
 assert.throws(()=>packagedFoodInput({...form,mealType:'unknown'}))
})
test('server preserves package-label fractions and allocates independent stable IDs',()=>{
 const meal=packagedFoodInput(form)
 const saved=normalizeMealInput(meal,'Larry',()=>new Date('2026-10-02T12:00:00Z'),()=> 'label-1')
 assert.equal(saved.id,'custom-snack1-label-1')
 assert.equal(saved.macros.carbohydrateGrams,4.5)
 assert.equal(saved.batchMacros.carbohydrateGrams,4.5)
 assert.equal(saved.serving,form.serving)
 assert.equal(saved.createdBy,'Larry')
})

import {validateBarcode,productDraft,lookupPackagedFood} from '../../netlify/lib/packaged-food-lookup.mjs'
test('barcode checks reject malformed codes and preserve leading zeroes',()=>{
 assert.equal(validateBarcode('0 12345678905'),'012345678905')
 for(const value of ['012345678906','https://example.com','123',''])assert.throws(()=>validateBarcode(value))
})
test('barcode draft never substitutes per-100g nutrition for missing per-serving data',()=>{
 const draft=productDraft({brands:'Test',product_name:'Drink',nutriments:{proteins_100g:30}},'012345678905')
 assert.equal(draft.macros.proteinGrams,null)
 const serving=productDraft({serving_size:'1 bottle',nutriments:{proteins_serving:30,fat_serving:0,carbohydrates_serving:4.5,'energy-kcal_serving':160}},'012345678905')
 assert.equal(serving.macros.fatGrams,0)
 assert.equal(serving.macros.carbohydrateGrams,4.5)
})
test('lookup handles unavailable and unknown products without fabricating nutrition',async()=>{
 await assert.rejects(lookupPackagedFood('012345678905',{fetcher:async()=>({ok:false})}),/unavailable/)
 await assert.rejects(lookupPackagedFood('012345678905',{fetcher:async()=>({ok:true,json:async()=>({status:0})})}),/not found/)
})
test('server rejects absent label macros instead of converting null to zero',()=>{
 for(const value of [null,'',false])assert.throws(()=>normalizeMealInput({...packagedFoodInput(form),macros:{...packagedFoodInput(form).macros,fatGrams:value}},'Larry',()=>new Date(),()=> 'id'))
})
