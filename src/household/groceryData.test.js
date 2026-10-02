import test from 'node:test'
import assert from 'node:assert/strict'
import {proposeWeeklyGroceries,parseGroceryIngredient} from './groceryData.js'
import {createGroceryRepository} from '../../netlify/lib/grocery-store.mjs'
import {createGroceryHandler} from '../../netlify/functions/grocery-list.mjs'
const meal={id:'oats',name:'Oat bowls',yieldQuantity:2,ingredients:['1 1/2 cups oats','½ cup milk','Pinch of salt']}
test('weekly groceries scale recipe batches and aggregate repeated ingredients without mixing units',()=>{
 const days=[{date:'2026-10-02',resolvedMeals:{breakfast:meal,dinner:{...meal,id:'other',name:'Second recipe',ingredients:['2 tablespoons oats']}}},{date:'2026-10-03',resolvedMeals:{breakfast:meal}}]
 const result=proposeWeeklyGroceries(days,4)
 assert.equal(result.items.find(item=>item.name==='oats'&&item.unit==='cup').quantity,'6 cup')
 assert.equal(result.items.find(item=>item.name==='oats'&&item.unit==='tbsp').quantity,'4 tbsp')
 assert.equal(result.items.find(item=>item.name==='milk').quantity,'2 cup')
 assert.equal(result.items.find(item=>item.name==='Pinch of salt').quantity,'As needed')
 assert.equal(result.items.find(item=>item.name==='milk').sources.length,2)
 assert.ok(result.items.every(item=>!item.selected))
 assert.equal(parseGroceryIngredient('1½ cups milk').amount,1.5)
 assert.equal(parseGroceryIngredient('1-2 cups milk').amount,null)
 assert.throws(()=>proposeWeeklyGroceries(days,NaN))
})
test('serving-only snacks retain their product identity and missing recipes are flagged',()=>{
 const result=proposeWeeklyGroceries([{date:'2026-10-02',resolvedMeals:{snack1:{name:'Premier Protein Chocolate',serving:'1 shake (11 fl oz)',ingredients:['1 shake (11 fl oz)']},lunch:{name:'Unspecified meal'},dinner:null}}],3)
 assert.equal(result.items[0].name,'Premier Protein Chocolate — 1 shake (11 fl oz) each')
 assert.equal(result.items[0].quantity,'3')
 assert.equal(result.missing.length,2)
})
function memory(){let data=null,etag=0;return {getWithMetadata:async()=>data?{data:structuredClone(data),etag:String(etag)}:null,setJSON:async(key,next,options)=>{if(options.onlyIfNew&&data||options.onlyIfMatch!==undefined&&options.onlyIfMatch!==String(etag))return {modified:false};data=structuredClone(next);etag++;return {modified:true}}}}
const item={name:'Milk',quantity:'2 bottles',category:'Food & Pantry',sourceKey:'week-milk'}
test('shared grocery store survives reloads, retries idempotently, and protects concurrent edits',async()=>{
 const store=memory(),repo=createGroceryRepository({store})
 const saved=await repo.mutate({action:'add',items:[item]},'Larry')
 const again=await repo.mutate({action:'add',items:[{...item,quantity:'999'}]},'Larry')
 assert.equal(again.items.length,1);assert.equal(again.items[0].quantity,'2 bottles');assert.equal(again.skipped,1)
 const changed=await repo.mutate({action:'update',id:saved.items[0].id,revision:1,patch:{quantity:'3 bottles',completed:true}},'Terica')
 assert.equal(changed.items[0].updatedBy,'Terica')
 await assert.rejects(repo.mutate({action:'update',id:saved.items[0].id,revision:1,patch:{quantity:'4'}},'Larry'),/another device/)
 assert.deepEqual((await createGroceryRepository({store}).read()).items,changed.items)
 await Promise.all([repo.mutate({action:'add',items:[{...item,sourceKey:'paper',name:'Paper towels'}]},'Larry'),repo.mutate({action:'add',items:[{...item,sourceKey:'soap',name:'Soap'}]},'Terica')])
 assert.equal((await repo.read()).items.length,3)
 await assert.rejects(repo.mutate({action:'add',items:[{...item,quantity:''}]},'Larry'),/valid/)
})
test('grocery endpoint requires authentication and planning permission for changes',async()=>{
 const repo=createGroceryRepository({store:memory()}),event={httpMethod:'POST',body:JSON.stringify({action:'add',items:[item]})}
 const handler=session=>createGroceryHandler({readSession:async()=>session,getPermissions:async()=>({Terica:{planning:true},Javin:{planning:false}}),repository:()=>repo})
 assert.equal((await handler(null)(event)).statusCode,401)
 assert.equal((await handler({member:'Javin',role:'member'})(event)).statusCode,403)
 assert.equal((await handler({member:'Terica',role:'member'})(event)).statusCode,200)
 const read=await handler({member:'Javin',role:'member'})({httpMethod:'GET'})
 assert.equal(JSON.parse(read.body).items.length,1);assert.equal(JSON.parse(read.body).canEdit,false)
 assert.equal((await handler({member:'Larry',role:'admin'})({...event,body:'bad'})).statusCode,400)
})
