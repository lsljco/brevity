import {createHash,randomUUID} from 'node:crypto'
import {getStore} from './scoped-store.mjs'
export const BACKUP_STORES=['brevity-household-state','brevity-household','brevity-meals','brevity-assistant-actions']
const digest=value=>createHash('sha256').update(value).digest('hex')
export const backupStore=name=>getStore({name,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
// Individual immutable records, not a cross-store transactional point-in-time image.
// Authentication credentials, integration tokens, chat and generated media are excluded.
export async function createHouseholdBackup({sourceStore=backupStore,destination=backupStore('brevity-recovery'),now=new Date(),id=randomUUID()}={}){
 const root=`snapshots/${now.toISOString().slice(0,10)}/${id}`,records=[],errors=[]
 for(const name of BACKUP_STORES){
  try{
   const source=sourceStore(name)
   for await(const page of source.list({paginate:true}))for(const blob of page.blobs){
    const result=await source.getWithMetadata(blob.key,{type:'arrayBuffer'})
    if(!result)throw Error('Record changed during backup.')
    const bytes=Buffer.from(result.data),recordId=digest(JSON.stringify([name,blob.key])),hash=digest(bytes)
    await destination.setJSON(`${root}/records/${recordId}`,{store:name,key:blob.key,encoding:'base64',data:bytes.toString('base64'),metadata:result.metadata||{},hash,capturedAt:now.toISOString()},{onlyIfNew:true})
    records.push({store:name,key:blob.key,recordId,hash})
   }
  }catch{errors.push({store:name,error:'Snapshot read or write failed; this backup is incomplete.'})}
 }
 const manifest={id,root,createdAt:now.toISOString(),state:errors.length?'incomplete':'complete',records,errors,notice:'Per-record recovery snapshot. Concurrent records may reflect different moments. Restore requires explicit operator review and version checks. Secrets, chat and media are excluded.'}
 await destination.setJSON(`${root}/manifest`,manifest,{onlyIfNew:true})
 return manifest
}
export async function readBackupRecord({destination,manifest,recordId}){
 if(manifest.state!=='complete')throw Error('Incomplete backups cannot be used for restore.')
 const expected=manifest.records.find(item=>item.recordId===recordId)
 if(!expected||!BACKUP_STORES.includes(expected.store))throw Error('Unknown backup record.')
 const record=await destination.get(`${manifest.root}/records/${recordId}`,{type:'json'})
 if(!record||record.hash!==expected.hash||record.key!==expected.key||record.store!==expected.store||digest(Buffer.from(record.data,'base64'))!==expected.hash)throw Error('Backup integrity check failed.')
 return {...record,bytes:Buffer.from(record.data,'base64')}
}
export async function restoreReviewedBackupRecord({destination,manifest,recordId,target,expectedEtag,confirmHash}){
 const record=await readBackupRecord({destination,manifest,recordId})
 if(confirmHash!==record.hash)throw Error('Review and confirm this exact backup content hash before restoring.')
 const result=await target.set(record.key,record.bytes,{metadata:record.metadata,...(expectedEtag?{onlyIfMatch:expectedEtag}:{onlyIfNew:true})})
 if(result?.modified===false)throw Error('The destination changed after review. No restore was performed.')
 return {restored:true,store:record.store,key:record.key,hash:record.hash}
}

export async function pruneHouseholdBackups(store,now=new Date()){
 const cutoff=new Date(now.getTime()-30*86400000).toISOString().slice(0,10)
 for await(const page of store.list({prefix:'snapshots/',paginate:true}))for(const blob of page.blobs){const date=blob.key.split('/')[1];if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<cutoff)await store.delete(blob.key)}
}
