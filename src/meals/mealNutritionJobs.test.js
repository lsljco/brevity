import test from 'node:test'
import assert from 'node:assert/strict'
import {createNutritionBackgroundHandler} from '../../netlify/functions/meal-nutrition-background.mjs'
import {createNutritionStatusHandler} from '../../netlify/functions/meal-nutrition-job-status.mjs'
const id='12345678-1234-1234-1234-123456789abc'
const request=body=>new Request('https://brevity.test/.netlify/functions/meal-nutrition-background',{method:'POST',body:JSON.stringify({jobId:id,ingredients:['1 cup cabbage'],yieldQuantity:12,yieldUnit:'servings',...body})})
const statusRequest=()=>new Request(`https://brevity.test/.netlify/functions/meal-nutrition-job-status?jobId=${id}`)
function fixture(){const data=new Map();return {data,store:{get:async key=>data.get(key),setJSON:async(key,value,options)=>{if(options?.onlyIfNew&&data.has(key))return {modified:false};data.set(key,value);return {modified:true}}},readSession:async()=>({member:'Larry'})}}
test('background nutrition publishes pending then ready, preserves batch yield and deduplicates delivery',async()=>{
 const f=fixture();let release,calls=0
 const result={perServingMacros:{calories:12},yieldQuantity:12}
 const handler=createNutritionBackgroundHandler({...f,calculate:async(input,options)=>{calls++;assert.equal(input.yieldQuantity,12);assert.equal(options.timeoutMs,150000);await new Promise(resolve=>release=resolve);return result}})
 const status=createNutritionStatusHandler(f)
 assert.equal((await (await status(statusRequest())).json()).state,'pending')
 const pending=handler(request());while(!release)await new Promise(resolve=>setImmediate(resolve))
 assert.equal((await (await status(statusRequest())).json()).state,'calculating')
 await handler(request());assert.equal(calls,1)
 release();await pending
 assert.deepEqual((await (await status(statusRequest())).json()).nutrition,result)
 const other=createNutritionStatusHandler({...f,readSession:async()=>({member:'Terica'})})
 assert.equal((await (await other(statusRequest())).json()).state,'pending')
})
test('nutrition failures become readable status and invalid ingredients never reach the model',async()=>{
 const f=fixture();let calls=0
 const handler=createNutritionBackgroundHandler({...f,calculate:async()=>{calls++;throw Error('Calculation timed out; retry.') }})
 await handler(request({ingredients:[]}));assert.equal(calls,0)
 assert.equal((await (await createNutritionStatusHandler(f)(statusRequest())).json()).state,'error')
 const other=fixture();await createNutritionBackgroundHandler({...other,calculate:async()=>{throw Error('Calculation timed out; retry.')}})(request())
 assert.match((await (await createNutritionStatusHandler(other)(statusRequest())).json()).error,/timed out/)
})
test('nutrition jobs require authentication and expire stalled calculations',async()=>{
 const f=fixture(),anonymous={...f,readSession:async()=>null}
 assert.equal((await createNutritionBackgroundHandler(anonymous)(request())).status,401)
 assert.equal((await createNutritionStatusHandler(anonymous)(statusRequest())).status,401)
 await createNutritionBackgroundHandler({...f,now:()=>0,calculate:async()=>({})})(request())
 assert.equal((await (await createNutritionStatusHandler({...f,now:()=>700000})(statusRequest())).json()).state,'error')
})
