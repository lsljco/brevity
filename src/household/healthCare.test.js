import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeCare,carePriorities} from '../health/healthCare.js'
import {createHealthCareHandler} from '../../netlify/functions/health-care.mjs'
const item={title:'Teeth cleaning',member:'Larry',type:'Dental',status:'Needs scheduling',priority:'Normal',date:''}
test('care needs support unscheduled dental care and validate scheduled dates',()=>{
 assert.equal(normalizeCare(item).date,'')
 assert.throws(()=>normalizeCare({...item,status:'Scheduled'}))
 assert.throws(()=>normalizeCare({...item,date:'2026-02-30'}))
 assert.equal(carePriorities([{...item,status:'Completed'},item],'2026-10-05').length,1)
})
test('care API enforces session, ownership, exact version and conditional saves',async()=>{
 let saved=null,etag='1',session={member:'Larry',role:'admin'}
 const store={getWithMetadata:async()=>saved?{data:saved,etag}:null,setJSON:async(key,value,opts)=>{assert.ok(opts.onlyIfNew||opts.onlyIfMatch===etag);saved=value;return{modified:true}}}
 const handler=createHealthCareHandler({store,readSession:async()=>session,createId:()=> 'care-1'})
 let result=await handler({httpMethod:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:0,item})});assert.equal(result.statusCode,200);assert.equal(saved.audit[0].actor,'Larry')
 result=await handler({httpMethod:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:0,item})});assert.equal(result.statusCode,409)
 session={member:'Nyla',role:'member'};result=await handler({httpMethod:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,id:'care-1',item:{...item,member:'Nyla'}})});assert.equal(result.statusCode,403)
 session=null;assert.equal((await handler({httpMethod:'GET'})).statusCode,401)
})
