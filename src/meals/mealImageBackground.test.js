import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createMealImageBackgroundHandler } from '../../netlify/functions/meal-image-generate-background.mjs'

const meal={id:'custom-breakfast-salmon',mealType:'breakfast',name:'Salmon, rice, and broccoli',ingredients:['7 oz Salmon Filet','1 tbsp brown sugar','1/2 cup rice','1/2 cup broccoli'],image:'/old.jpg'}

test('background meal image generation records progress and applies the completed shared override',async()=>{
  const writes=[],overrides=[]
  const handler=createMealImageBackgroundHandler({
    readSessionFn:async()=>({member:'Larry'}),
    repository:{getLibrary:async()=>({library:[meal]}),setMealImage:async value=>overrides.push(value)},
    jobStore:{setJSON:async(key,value)=>writes.push({key,value})},imageStore:{},
    generateImage:async({meal:candidate})=>{assert.deepEqual(candidate.ingredients,meal.ingredients);assert.equal(candidate.image,'');return'/.netlify/functions/meal-images?id=new'},
    now:()=>new Date('2026-09-16T10:00:00Z'),
  })
  const response=await handler(new Request('https://example.test/.netlify/functions/meal-image-generate-background',{method:'POST',headers:{cookie:'session=1','content-type':'application/json'},body:JSON.stringify({jobId:'job-1',mealId:meal.id})}))
  assert.equal(response.status,202)
  assert.deepEqual(writes.map(write=>write.value.state),['generating','ready'])
  assert.equal(writes[1].value.meal.image,'/.netlify/functions/meal-images?id=new')
  assert.deepEqual(overrides,[{mealId:meal.id,image:'/.netlify/functions/meal-images?id=new',actor:'Larry'}])
})

test('background generation retains a pollable error instead of surfacing a gateway timeout',async()=>{
  const writes=[]
  const handler=createMealImageBackgroundHandler({readSessionFn:async()=>({member:'Larry'}),repository:{getLibrary:async()=>({library:[meal]})},jobStore:{setJSON:async(_key,value)=>writes.push(value)},imageStore:{},generateImage:async()=>{throw new Error('generation unavailable')}})
  const response=await handler(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobId:'job-2',mealId:meal.id})}))
  assert.equal(response.status,202)
  assert.equal(writes.at(-1).state,'error')
  assert.equal(writes.at(-1).error,'generation unavailable')
})

test('background and status endpoints declare the long-running and pollable Netlify contracts',()=>{
  const background=readFileSync(new URL('../../netlify/functions/meal-image-generate-background.mjs',import.meta.url),'utf8')
  const status=readFileSync(new URL('../../netlify/functions/meal-image-job-status.mjs',import.meta.url),'utf8')
  assert.match(background,/config=\{background:true/)
  assert.match(status,/state:'pending'/)
  assert.match(status,/readSession/)
})

test('automatic image jobs share a conditional claim across devices and preserve an intervening upload',async()=>{
 const records=new Map(),writes=[],missing={...meal,image:''};let count=0,finish
 const barrier=new Promise(resolve=>{finish=resolve})
 const jobStore={getWithMetadata:async key=>records.has(key)?{data:records.get(key),etag:'1'}:null,setJSON:async(key,value,options)=>{if(options?.onlyIfNew&&records.has(key))return {modified:false};records.set(key,value);writes.push(value);return {modified:true}}}
 const handler=createMealImageBackgroundHandler({readSessionFn:async()=>({member:'Larry'}),repository:{getLibrary:async()=>({library:[missing]}),setMealImage:async value=>{assert.equal(value.onlyIfMissing,true);return{image:'/uploaded-while-generating.jpg'}}},jobStore,imageStore:{},generateImage:async()=>{count++;await barrier;return'/generated.png'}})
 const request=()=>new Request('https://example.test',{method:'POST',body:JSON.stringify({jobId:`auto-${meal.id}`,mealId:meal.id,onlyIfMissing:true})})
 const first=handler(request());await new Promise(resolve=>setImmediate(resolve));await handler(request());finish();await first
 assert.equal(count,1);assert.equal(writes.at(-1).meal.image,'/uploaded-while-generating.jpg')
})
test('automatic generation never replaces an existing photo',async()=>{
 let count=0;const writes=[]
 const handler=createMealImageBackgroundHandler({readSessionFn:async()=>({member:'Larry'}),repository:{getLibrary:async()=>({library:[meal]})},jobStore:{setJSON:async(key,value)=>writes.push(value)},imageStore:{},generateImage:async()=>{count++}})
 await handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({jobId:`auto-${meal.id}`,mealId:meal.id,onlyIfMissing:true})}))
 assert.equal(count,0);assert.equal(writes[0].meal.image,meal.image)
})

test('custom calendar image generation saves against exact ingredients and follows the recipe on day moves',async()=>{
 const {createMealPlanRepository}=await import('../../netlify/lib/meal-plan-store.mjs')
 const {applyMealScheduleCommand}=await import('./householdMealPlanning.js')
 const key='lslj-family/schedule',date='2026-10-04',slot='dinner',id=`scheduled-${date}-${slot}`
 const recipe={name:'Steak + broccoli',ingredients:['6 ounces cooked steak','1 cup cooked broccoli'],instructions:['Cook fully.'],macros:{calories:450,proteinGrams:40,carbohydrateGrams:12,fatGrams:25},yieldQuantity:1,serving:'1 person'}
 const records=new Map([[key,{version:1,days:{[date]:{meals:{dinner:null},recipes:{dinner:recipe},substitutions:{dinner:{customized:true}}}}}]])
 const store={get:async key=>records.get(key)||null,getWithMetadata:async key=>records.has(key)?{data:records.get(key),etag:String(records.get(key).version)}:null,setJSON:async(key,value,options)=>{assert.equal(options.onlyIfMatch,String(records.get(key).version));records.set(key,value);return {modified:true}}}
 const repository=createMealPlanRepository({store}),jobs=[]
 const handler=createMealImageBackgroundHandler({readSessionFn:async()=>({member:'Larry'}),repository,imageStore:{},jobStore:{setJSON:async(_key,value)=>jobs.push(value)},generateImage:async({meal})=>{assert.deepEqual(meal.ingredients,recipe.ingredients);return '/generated-steak.png'}})
 await handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({jobId:'scheduled-image',mealId:id})}))
 assert.equal(jobs.at(-1).state,'ready');assert.equal((await repository.getScheduledMeal(id)).image,'/generated-steak.png');assert.equal(records.get(key).version,2)
 const destination='2026-10-05',baseDays={[date]:{date,meals:{dinner:null}},[destination]:{date:destination,meals:{dinner:null}}}
 const moved=applyMealScheduleCommand(records.get(key),{kind:'move',date,slot,toDate:destination,toSlot:'lunch'},baseDays)
 assert.equal(moved.days[destination].recipes.lunch.image,'/generated-steak.png')
 records.set(key,moved)
 await assert.rejects(()=>repository.setScheduledMealImage({mealId:id,image:'/stale.png',expectedMeal:recipe}),/changed while/)
 const movedId=`scheduled-${destination}-lunch`,expected=await repository.getScheduledMeal(movedId)
 records.get(key).days[destination].recipes.lunch={...expected,ingredients:['6 ounces cooked chicken']}
 await assert.rejects(()=>repository.setScheduledMealImage({mealId:movedId,image:'/stale.png',expectedMeal:expected}),/changed while/)
})
