import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeIdeaRequest,normalizeIdeas,IDEA_STYLES,ideaKey,saveMealIdea} from '../../netlify/lib/meal-ideas.mjs'
import {createMealIdeasHandler} from '../../netlify/functions/meal-ideas-background.mjs'
import {createMealIdeasStatusHandler} from '../../netlify/functions/meal-ideas.mjs'
const id='12345678-1234-1234-1234-123456789abc'
const raw=()=>({ideas:IDEA_STYLES.flatMap((style,i)=>[0,1].map(n=>({name:`Grilled chicken ${i}-${n}`,description:'Cooked chicken with potatoes',style,prepMinutes:5,cookMinutes:15,ingredients:[{input:'150 g raw chicken breast',available:true,calories:165,proteinGrams:31,carbohydrateGrams:0,fatGrams:4},{input:'5 g olive oil',available:false,calories:45,proteinGrams:0,carbohydrateGrams:0,fatGrams:5}],instructions:['Cook the chicken thoroughly in the measured oil.'],assumptions:['Chicken is boneless and skinless.']})))})
const input={ingredients:'chicken breast',maxMinutes:30}
const request=(body={})=>new Request('https://brevity.test/.netlify/functions/meal-ideas-background',{method:'POST',body:JSON.stringify({jobId:id,...input,...body})})
const statusRequest=()=>new Request(`https://brevity.test/.netlify/functions/meal-ideas?jobId=${id}`)
function fixture(){const data=new Map();return {data,store:{get:async key=>structuredClone(data.get(key)),setJSON:async(key,value,options)=>{if(options?.onlyIfNew&&data.has(key))return{modified:false};data.set(key,structuredClone(value));return{modified:true}}},readSession:async()=>({member:'Larry'}),imageStore:{},generate:async()=>normalizeIdeas(raw(),input),generateImage:async({assetId})=>`/.netlify/functions/meal-images?id=${assetId}`}}
test('six distinct options span three styles and sum measured ingredients per serving, including cooking fats',()=>{
 const meals=normalizeIdeas(raw(),input)
 assert.equal(meals.length,6);assert.deepEqual(meals[0].macros,{calories:210,proteinGrams:31,carbohydrateGrams:0,fatGrams:9})
 assert.deepEqual(meals[0].extras,['5 g olive oil']);assert.equal(meals[0].yieldQuantity,1);assert.match(meals[0].nutritionBasis,/Estimated per serving/)
 for(const style of IDEA_STYLES)assert.equal(meals.filter(m=>m.style===style).length,2)
})
test('reject invalid inputs, absent macros, duplicate dishes, time violations and excluded household foods',()=>{
 for(const body of [{ingredients:''},{ingredients:'x'.repeat(2001)},{...input,maxMinutes:14}])assert.throws(()=>normalizeIdeaRequest(body))
 for(const change of [p=>p.ideas[0].ingredients[0].calories=NaN,p=>p.ideas[0].name=p.ideas[1].name,p=>p.ideas[0].cookMinutes=60,p=>p.ideas[0].ingredients[0].input='150 g shrimp',p=>p.ideas[0].instructions=[]]){const p=raw();change(p);assert.throws(()=>normalizeIdeas(p,input))}
})
test('background discovery publishes recipes before images, deduplicates delivery and tolerates a photo failure',async()=>{
 const f=fixture();let calls=0,seen=[]
 const handler=createMealIdeasHandler({...f,generateImage:async({meal})=>{calls++;seen.push(f.data.get(ideaKey('Larry',id)).state);if(meal.id==='idea-2')throw Error('image failed');return '/.netlify/functions/meal-images?id=photo'}})
 await handler(request());await handler(request())
 assert.equal(calls,6);assert.ok(seen.every(state=>state==='illustrating'))
 const result=await(await createMealIdeasStatusHandler(f)(statusRequest())).json()
 assert.equal(result.state,'ready');assert.equal(result.ideas[1].imageState,'error');assert.equal(result.ideas[0].imageState,'ready')
 assert.equal((await(await createMealIdeasStatusHandler({...f,readSession:async()=>({member:'Terica'})})(statusRequest())).json()).state,'pending')
})
test('discovery requires sign in, validates before model calls and expires requests',async()=>{
 const f=fixture();assert.equal((await createMealIdeasHandler({...f,readSession:async()=>null})(request())).status,401)
 assert.equal((await createMealIdeasStatusHandler({...f,readSession:async()=>null})(statusRequest())).status,401)
 await createMealIdeasHandler({...f,generate:async()=>{assert.fail('invalid input reached generation')}})(request({ingredients:''}))
 assert.equal((await(await createMealIdeasStatusHandler(f)(statusRequest())).json()).state,'error')
 const fresh=fixture();await createMealIdeasHandler({...fresh,now:()=>0})(request())
 assert.equal((await(await createMealIdeasStatusHandler({...fresh,now:()=>86400001})(statusRequest())).json()).state,'error')
})
test('saving uses the authenticated stored recipe and generated image, ignoring supplied tampering; retries return same meal',async()=>{
 const f=fixture();await createMealIdeasHandler(f)(request());const library=[];let creates=0
 const repository={getLibrary:async()=>({library}),createMeal:async({meal})=>{creates++;const saved={...meal,id:'saved'};library.push(saved);return saved}}
 const body={ideaJobId:id,ideaId:'idea-1',image:'https://attacker.test/image',macros:{calories:0}}
 const meal=await saveMealIdea({body,member:'Larry',repository,store:f.store})
 assert.equal(meal.macros.calories,210);assert.match(meal.image,/^\/\.netlify\/functions\/meal-images/)
 assert.equal((await saveMealIdea({body,member:'Larry',repository,store:f.store})).id,'saved');assert.equal(creates,1)
 await assert.rejects(saveMealIdea({body,member:'Terica',repository,store:f.store}),/expired/)
})
