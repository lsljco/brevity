import { createHash } from 'node:crypto'
import { getStore } from './scoped-store.mjs'

export const cleanSermonImport = text => String(text || '').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{4,}/g,'\n\n\n').trim()
export const originalSourceHash = text => createHash('sha256').update(cleanSermonImport(text)).digest('hex')
export const originalKey = hash => {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid sermon source identity.')
  return `${process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'}/originals/${hash}`
}
export const originalStore = () => getStore({name:'brevity-sermon-originals',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})

export async function retainOriginalWord({buffer,text,fileName,member,store=originalStore()}) {
  const sourceHash=originalSourceHash(text), key=originalKey(sourceHash)
  const record={sourceHash,fileName,uploadedBy:member,uploadedAt:new Date().toISOString(),fileHash:createHash('sha256').update(buffer).digest('hex'),data:buffer.toString('base64')}
  const result=await store.setJSON(key,record,{onlyIfNew:true})
  if(result?.modified===false){
    const existing=await store.get(key,{type:'json'})
    if(existing?.fileHash!==record.fileHash)throw new Error('An original Word file with different formatting is already retained for this exact source. The retained file has not been replaced.')
  }
  return {sourceHash,documentUrl:`/.netlify/functions/sermon-original?sourceHash=${sourceHash}&download=1`}
}
