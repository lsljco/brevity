import test from 'node:test'
import assert from 'node:assert/strict'
import {createLibraryImageBatch} from '../../netlify/lib/meal-library-images.mjs'
import {isBrevityMealImage} from './mealImageStyle.js'
test('image origin identifies imported and uploaded photos without replacing existing Brevity images',()=>{
 assert.equal(isBrevityMealImage({image:'https://example.com/photo.jpg'}),false)
 assert.equal(isBrevityMealImage({image:'/meal-images/dinner-01.webp'}),true)
 assert.equal(isBrevityMealImage({image:'/.netlify/functions/meal-images?id=upload',imageOrigin:'uploaded'}),false)
 assert.equal(isBrevityMealImage({image:'/.netlify/functions/meal-images?id=generated'}),true)
})
test('durable library rendering resumes in batches, deduplicates workers and retries failures',async()=>{
 let state=null,version=0,clock=new Date('2026-10-04T21:00:00Z'),count=0
 const meals=Array.from({length:27},(_,i)=>({id:`meal-${i}`,name:`Meal ${i}`,image:`https://example.com/${i}.jpg`}))
 meals.push({id:'keep',image:'/meal-images/keep.webp'})
 const store={getWithMetadata:async()=>state?{data:structuredClone(state),etag:String(version)}:null,setJSON:async(_key,value,options)=>{if(options.onlyIfNew&&state||options.onlyIfMatch&&options.onlyIfMatch!==String(version))return{modified:false};state=structuredClone(value);version++;return{modified:true}}}
 const repository={getLibrary:async()=>({library:structuredClone(meals)}),setMealImage:async({mealId,image,expectedImage,onlyIfNonBrevity})=>{assert.ok(onlyIfNonBrevity);const meal=meals.find(m=>m.id===mealId);assert.equal(meal.image,expectedImage);meal.image=image}}
 const batch=createLibraryImageBatch({store,repository,imageStore:{},now:()=>clock,generateImage:async({meal})=>{count++;if(meal.id==='meal-0')throw Error('Temporary provider failure');return `/.netlify/functions/meal-images?id=${meal.id}`}})
 await batch.start('Larry');await Promise.all([batch.run(),batch.run()]);assert.equal(count,4);assert.equal((await batch.status()).remaining,24)
 await batch.run();assert.equal(count,4)
 for(let i=0;i<9;i++){clock=new Date(clock.getTime()+120_000);await batch.run()}
 assert.equal((await batch.status()).remaining,1)
 await batch.run();assert.equal((await batch.status()).active,false);assert.equal((await batch.status()).failed.length,1)
 const oldCount=count;await batch.run();assert.equal(count,oldCount)
 await batch.start('Larry');assert.equal((await batch.status()).failed.length,0)
 meals.push({id:'new-import',image:'https://example.com/new.jpg'});assert.equal((await batch.status()).active,true)
})

test('rate limits pause the batch without exhausting recipe retries',async()=>{
 let state=null,version=0,clock=new Date('2026-10-05T00:00:00Z'),count=0,limited=true
 const meals=Array.from({length:8},(_,i)=>({id:`m${i}`,image:'https://example.com/photo.jpg'}))
 const store={getWithMetadata:async()=>state?{data:structuredClone(state),etag:String(version)}:null,setJSON:async(_key,value)=>{state=structuredClone(value);version++;return{modified:true}}}
 const repository={getLibrary:async()=>({library:structuredClone(meals)}),setMealImage:async({mealId,image})=>{meals.find(m=>m.id===mealId).image=image}}
 const batch=createLibraryImageBatch({store,repository,imageStore:{},now:()=>clock,generateImage:async({meal})=>{count++;if(limited)throw Object.assign(Error('Too many requests'),{status:429});return `/.netlify/functions/meal-images?id=${meal.id}`}})
 await batch.start('Larry');await batch.run();assert.equal(count,2);assert.deepEqual(state.failures,{});assert.equal((await batch.status()).active,true)
 await batch.run();assert.equal(count,2)
 await batch.start('Larry');await batch.run();assert.equal(count,2)
 clock=new Date(clock.getTime()+120_000);limited=false;await batch.run();assert.equal(count,6);assert.equal((await batch.status()).remaining,4)
 await batch.run();assert.equal(count,6)
 clock=new Date(clock.getTime()+120_000);await batch.run();assert.equal((await batch.status()).remaining,0)
})
