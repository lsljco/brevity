import test from 'node:test'
import assert from 'node:assert/strict'
import {planToEatMeals,previewPlanToEatImport,parseRecipeCsv} from './planToEatImport.js'
import {mealReadyForPlanning,libraryCategory} from './mealCategories.js'
import {automaticMealAllowed} from './householdMealPlanning.js'
import {createMealPlanRepository} from '../../netlify/lib/meal-plan-store.mjs'
const headers=['Title','Course','Description','Servings','Yield','Ingredients','Directions','Public Url','Photo Url','Calories','Fat','Protein','Carbohydrate','Prep Time','Cook Time','Total Time','Url']
const encode=rows=>[headers,...rows.map(row=>headers.map(h=>row[h]??''))].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')
const recipe=(id,extra={})=>({Title:'Chicken, "Sunday" style',Course:'Main Course',Servings:'6',Yield:'6 servings',Ingredients:'36 oz chicken breast\n6 cups broccoli',Directions:'Cook fully.\nDivide into six portions.','Public Url':`https://app.plantoeat.com/recipes/${id}`,'Photo Url':'https://example.com/chicken.jpg',Calories:'450',Fat:'10g',Protein:'42 g',Carbohydrate:'30',...extra})
test('CSV import preserves multiline recipes, quotes, sources, yields and fractional per-serving macros',()=>{
 const [meal]=planToEatMeals('\ufeff'+encode([recipe(1,{Protein:'42.5g'})]))
 assert.equal(meal.name,'Chicken, "Sunday" style');assert.equal(meal.yieldQuantity,6);assert.equal(meal.macros.proteinGrams,42.5);assert.equal(meal.ingredients.length,2);assert.equal(meal.instructions.length,2);assert.equal(meal.image,'https://example.com/chicken.jpg');assert.deepEqual(meal.sourceExport,parseRecipeCsv(encode([recipe(1,{Protein:'42.5g'})]))[0]);assert.ok(mealReadyForPlanning(meal))
})
test('unknown nutrition is null and incomplete imports cannot be automatically planned',()=>{
 const [meal]=planToEatMeals(encode([recipe(2,{Course:'Side Dishes',Protein:'',Fat:'',Servings:'1',Yield:''})]))
 assert.equal(meal.mealType,'side');assert.equal(meal.macros.proteinGrams,null);assert.equal(meal.importReviewRequired,true);assert.equal(mealReadyForPlanning(meal),false);assert.equal(automaticMealAllowed(meal),false)
 assert.equal(libraryCategory({mealType:'breakfast'}),'meal');assert.equal(libraryCategory({mealType:'snack2'}),'ingredient')
})
test('source identities make retry safe while retaining different recipes with the same title',()=>{
 const csv=encode([recipe(1),recipe(2,{Ingredients:'Different measured ingredients'})]),first=previewPlanToEatImport(csv)
 assert.equal(first.meals.length,2);assert.equal(previewPlanToEatImport(csv,first.meals).meals.length,0)
 assert.throws(()=>planToEatMeals(encode([recipe(1,{'Public Url':'javascript:alert(1)'})])),/identity/)
 assert.throws(()=>parseRecipeCsv('Title,Ingredients\n"Unclosed'),/quoted cell/)
})
test('CSV writes merge with concurrent library changes and remain idempotent',async()=>{
 const data=new Map();let version=0,conflict=true
 const store={get:async key=>data.get(key)||null,getWithMetadata:async key=>data.has(key)?{data:data.get(key),etag:String(version)}:null,setJSON:async(key,value)=>{if(conflict){conflict=false;version++;data.set(key,{version,meals:[{id:'custom-existing',name:'Keep me',mealType:'meal'}]});return {modified:false}}data.set(key,value);version++;return {modified:true}}}
 const repo=createMealPlanRepository({store}),csv=encode([recipe(1),recipe(2,{Protein:''})])
 const result=await repo.importPlanToEat({csv,actor:'Larry'});assert.equal(result.added,2);assert.equal(result.needsReview,1)
 const library=(await repo.getLibrary()).library;assert.ok(library.some(m=>m.id==='custom-existing'));assert.equal(library.find(m=>m.id==='custom-plantoeat-1').createdBy,'Larry')
 assert.equal((await repo.importPlanToEat({csv,actor:'Larry'})).added,0)
})

test('favorite and seasonal labels persist independently without replacing recipes or nutrition',async()=>{
 const data=new Map();let version=0
 const store={get:async key=>data.get(key)||null,getWithMetadata:async key=>data.has(key)?{data:data.get(key),etag:String(version)}:null,setJSON:async(key,value)=>{data.set(key,value);version++;return {modified:true}}}
 const repo=createMealPlanRepository({store});await repo.importPlanToEat({csv:encode([recipe(88,{Protein:''})])})
 await repo.setMealPreferences({mealId:'custom-plantoeat-88',preferences:{favorite:true},actor:'Larry'})
 await repo.setMealPreferences({mealId:'custom-plantoeat-88',preferences:{seasons:['Fall','Winter']},actor:'Larry'})
 let meal=(await repo.getLibrary()).library.find(m=>m.id==='custom-plantoeat-88')
 assert.equal(meal.favorite,true);assert.deepEqual(meal.seasons,['Fall','Winter']);assert.equal(meal.macros.proteinGrams,null);assert.equal(mealReadyForPlanning(meal),false)
 await repo.setMealPreferences({mealId:meal.id,preferences:{favorite:false,seasons:[]}})
 meal=(await repo.getLibrary()).library.find(m=>m.id===meal.id)
 assert.equal(meal.favorite,false);assert.deepEqual(meal.seasons,[])
 await assert.rejects(()=>repo.setMealPreferences({mealId:meal.id,preferences:{seasons:['Invalid']}}),/Choose Spring/)
 await assert.rejects(()=>repo.setMealPreferences({mealId:meal.id,preferences:{macros:{}}}),/Choose favorite/)
})

test('imported sauces with possible seafood stay out of automatic plans',()=>{
 const [meal]=planToEatMeals(encode([recipe(90,{Ingredients:'36 oz beef\n2 tablespoons Worcestershire sauce'})]))
 assert.equal(mealReadyForPlanning(meal),true);assert.equal(automaticMealAllowed(meal),false)
})
