import {createCipheriv,createDecipheriv,randomBytes,randomUUID,createHash} from 'node:crypto'
import {getStore} from './scoped-store.mjs'
export const MAX_VENDOR_FILE=3*1024*1024
const error=(message,status=400)=>Object.assign(Error(message),{status})
export function sealVendorBytes(bytes,key,aad){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad))
 return {v:1,iv:iv.toString('base64'),tag:null,data:Buffer.concat([cipher.update(bytes),cipher.final()]).toString('base64'),...{tag:cipher.getAuthTag().toString('base64')}}
}
export function openVendorBytes(value,key,aad){
 if(value?.v!==1)throw error('Unsupported protected file.',503)
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(Buffer.from(value.tag,'base64'))
 return Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()])
}
export function detectVendorFile(bytes){
 if(bytes.subarray(0,5).toString()==='%PDF-')return 'application/pdf'
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png'
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg'
 if(['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()))return 'image/gif'
 if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'image/webp'
 throw error('Use a PDF, PNG, JPEG, GIF or WebP file. Executable and web documents are not accepted.')
}
export const vendorVisible=(vendor,session)=>Boolean(vendor&&(session.role==='admin'||vendor.accessMembers?.includes(session.member)))
export function createVendorVault({store,keys,household='lslj-family',now=()=>new Date(),createId=randomUUID}){
 const safe=value=>{if(!/^[-a-zA-Z0-9_.:]{1,200}$/.test(value))throw error('Invalid protected-file reference.');return value}
 const keyFor=(vendorId,blobId)=>`${household}/files/${safe(vendorId)}/${safe(blobId)}`
 async function master(){
  const name=`${household}/aes-v1`;let current=await keys.get(name,{type:'json'})
  if(!current){await keys.setJSON(name,{key:randomBytes(32).toString('base64')},{onlyIfNew:true});current=await keys.get(name,{type:'json'})}
  const bytes=Buffer.from(current?.key||'','base64');if(bytes.length!==32)throw error('Protected storage is unavailable.',503);return bytes
 }
 return {
  async stage(vendorId,kind,bytes,metadata,actor){
   const blobId=createId(),key=keyFor(vendorId,blobId),aad=`${key}/${kind}`,envelope=sealVendorBytes(bytes,await master(),aad)
   const record={blobId,vendorId,kind,metadata,createdAt:now().toISOString(),createdBy:actor,...(kind==='document'?{sha256:createHash('sha256').update(bytes).digest('hex')}:{}),envelope}
   await store.setJSON(key,record,{onlyIfNew:true});return {blobId,...metadata}
  },
  async metadata(vendorId,blobId){const entry=await store.get(keyFor(vendorId,blobId),{type:'json'});if(!entry)throw error('Protected upload not found.',404);const {envelope,...metadata}=entry;return metadata},
  async read(vendorId,blobId,kind){const key=keyFor(vendorId,blobId),record=await store.get(key,{type:'json'});if(!record||record.kind!==kind)throw error('Protected file not found.',404);return openVendorBytes(record.envelope,await master(),`${key}/${kind}`)},
  async audit(actor,vendorId,action){await store.setJSON(`${household}/access-audit/${createId()}`,{actor,vendorId,action,at:now().toISOString()},{onlyIfNew:true})},
  async consumeUnlockAttempt(member){
   const key=`${household}/unlock-attempts/${safe(member)}`,entry=await store.getWithMetadata(key,{type:'json'}),current=entry?.data
   if(entry&&!entry.etag)throw error('Protected storage did not provide a safe version marker.',503)
   const fresh=current&&now()-Date.parse(current.start)<300000,attempts=fresh?current.attempts:0
   if(attempts>=5)throw error('Too many unlock attempts. Wait five minutes and try again.',429)
   const result=await store.setJSON(key,{start:fresh?current.start:now().toISOString(),attempts:attempts+1},entry?{onlyIfMatch:entry.etag}:{onlyIfNew:true})
   if(result?.modified===false)throw error('An unlock attempt is already in progress. Try again.',409)
  },
 }
}
export function productionVendorVault(){return createVendorVault({store:getStore({name:'brevity-vendor-vault',consistency:'strong'}),keys:getStore({name:'brevity-vendor-keyring',consistency:'strong'}),household:process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'})}
