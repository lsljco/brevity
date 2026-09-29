// Operator recovery. Requires the existing Netlify project credential in environment.
// Never accepts credentials in command-line arguments, prints record contents or restores an entire store.
import {readFile,writeFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {backupStore,readBackupRecord,restoreReviewedBackupRecord} from '../netlify/lib/household-backup.mjs'
const args=process.argv.slice(2),mode=args[0]
if(!['review','apply'].includes(mode))throw Error('Use review <snapshot-root> <record-id> <local-review-file> or apply <local-review-file> <confirmed-hash>.')
const destination=backupStore('brevity-recovery')
if(mode==='review'){
 const [,root,recordId,file]=args
 if(!/^snapshots\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}$/.test(root||'')||!/^[a-f0-9]{64}$/.test(recordId||'')||!file)throw Error('Choose an existing snapshot root, record hash and review-file path.')
 const manifest=await destination.get(`${root}/manifest`,{type:'json'}),record=await readBackupRecord({destination,manifest,recordId}),current=await backupStore(record.store).getWithMetadata(record.key,{type:'arrayBuffer'})
 const review={snapshotRoot:root,recordId,store:record.store,key:record.key,contentHash:record.hash,expectedEtag:current?.etag||null,reviewedAt:new Date().toISOString(),backupCapturedAt:record.capturedAt,backupContent:record.bytes.toString('utf8'),notice:'Sensitive local review. Confirm exact record contents and scope. Apply requires this contentHash and unchanged destination version. Existing destination bytes are retained in the protected recovery store before restore.'}
 await writeFile(file,JSON.stringify(review,null,2),{mode:0o600,flag:'wx'})
 console.info('Recovery review saved. Inspect it securely before applying; no household record changed.')
}else{
 const [,file,confirmHash]=args,review=JSON.parse(await readFile(file,'utf8'))
 if(!/^[a-f0-9]{64}$/.test(confirmHash||'')||confirmHash!==review.contentHash)throw Error('The explicit confirmation hash must match the reviewed record.')
 const manifest=await destination.get(`${review.snapshotRoot}/manifest`,{type:'json'}),record=await readBackupRecord({destination,manifest,recordId:review.recordId})
 if(record.store!==review.store||record.key!==review.key||record.hash!==confirmHash)throw Error('Review identity does not match the immutable backup.')
 const target=backupStore(record.store),current=await target.getWithMetadata(record.key,{type:'arrayBuffer'})
 if((current?.etag||null)!==review.expectedEtag)throw Error('The destination changed after review; prepare a fresh review. Nothing was restored.')
 const id=randomUUID(),audit={id,state:'prepared',store:record.store,key:record.key,sourceRoot:manifest.root,recordId:review.recordId,expectedEtag:review.expectedEtag,at:new Date().toISOString(),operator:process.env.BREVITY_OPERATOR||'Netlify credential holder',before:current?{data:Buffer.from(current.data).toString('base64'),metadata:current.metadata||{}}:null}
 await destination.setJSON(`restores/${id}`,audit,{onlyIfNew:true})
 await restoreReviewedBackupRecord({destination,manifest,recordId:review.recordId,target,expectedEtag:review.expectedEtag,confirmHash})
 await destination.setJSON(`restores/${id}`,{...audit,state:'complete',completedAt:new Date().toISOString()})
 console.info(`Restored one reviewed record. Recovery audit: ${id}. Retain the audit identifier for rollback.`)
}
