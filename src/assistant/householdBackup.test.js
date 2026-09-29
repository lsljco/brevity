import test from 'node:test'
import assert from 'node:assert/strict'
import {createHouseholdBackup,readBackupRecord,restoreReviewedBackupRecord} from '../../netlify/lib/household-backup.mjs'
test('recovery snapshots verify bytes, require exact approval and reject concurrent restores',async()=>{
 const values=new Map(),destination={async setJSON(key,value){values.set(key,value)},async get(key){return values.get(key)}}
 const source={async *list(){yield{blobs:[{key:'fixture'}]}},async getWithMetadata(){return{data:Buffer.from('{"fixture":true}'),metadata:{type:'fixture'}}}}
 const manifest=await createHouseholdBackup({sourceStore:()=>source,destination,id:'fixture',now:new Date('2026-09-29T12:00Z')})
 assert.equal(manifest.state,'complete');assert.equal(manifest.records.length,4)
 const id=manifest.records[0].recordId,record=await readBackupRecord({destination,manifest,recordId:id})
 assert.equal(record.bytes.toString(),'{"fixture":true}')
 await assert.rejects(()=>restoreReviewedBackupRecord({destination,manifest,recordId:id,confirmHash:'wrong'}),/Review and confirm/)
 let saved;const target={async set(key,bytes,options){saved={key,bytes,options};return{modified:true}}}
 await restoreReviewedBackupRecord({destination,manifest,recordId:id,target,expectedEtag:'reviewed',confirmHash:record.hash})
 assert.equal(saved.options.onlyIfMatch,'reviewed');assert.equal(saved.bytes.toString(),'{"fixture":true}')
 await assert.rejects(()=>restoreReviewedBackupRecord({destination,manifest,recordId:id,target:{set:async()=>({modified:false})},expectedEtag:'stale',confirmHash:record.hash}),/changed after review/)
 values.get(`${manifest.root}/records/${id}`).data=Buffer.from('corrupted').toString('base64')
 await assert.rejects(()=>readBackupRecord({destination,manifest,recordId:id}),/integrity/)
})
test('an unavailable source never produces a complete backup',async()=>{
 const manifest=await createHouseholdBackup({sourceStore:()=>({async *list(){throw Error('offline')}}),destination:{setJSON:async()=>{}},id:'fixture'})
 assert.equal(manifest.state,'incomplete');assert.equal(manifest.errors.length,4)
 await assert.rejects(()=>readBackupRecord({manifest}),/Incomplete/)
})

test('maintenance signatures bind the job body and expire, with no shared token sent',async()=>{
 const {dispatchMaintenance,verifyMaintenanceRequest}=await import('../../netlify/lib/maintenance-dispatch.mjs')
 let request
 await dispatchMaintenance('backup',{origin:'https://fixture.netlify.app',key:'test-key',fetcher:async(url,options)=>{request=options;return{status:202}}})
 const args={body:request.body,time:request.headers['x-brevity-time'],proof:request.headers['x-brevity-proof'],key:'test-key'}
 assert.equal(verifyMaintenanceRequest(args),true);assert.equal(verifyMaintenanceRequest({...args,body:'changed'}),false);assert.equal(verifyMaintenanceRequest({...args,now:Number(args.time)+180000}),false)
 assert.doesNotMatch(JSON.stringify(request),/test-key/)
})
