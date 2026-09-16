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
