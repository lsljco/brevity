import {createHash,randomUUID} from 'node:crypto'
import JSZip from 'jszip'
import {getStore} from './scoped-store.mjs'
export const vaultStore=()=>getStore({name:'brevity-revelation-vault',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
export const root=()=>`${process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'}/`
export const vaultKey=owner=>`${root()}members/${owner.toLowerCase()}/library`
export const sourceKey=(owner,id)=>`${root()}members/${owner.toLowerCase()}/sources/${id}`
export const jobKey=(owner,id)=>`${root()}members/${owner.toLowerCase()}/jobs/${id}`
export const hash=value=>createHash('sha256').update(value).digest('hex')
export const emptyVault=()=>({revision:0,collections:[],discoveries:[],drafts:[],jobs:[],retention:'Keep until deliberately removed'})
export const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value)
const required=(value,label,max=150000)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`${label} is required and must be at most ${max.toLocaleString()} characters.`);return value}
const tags=value=>Array.isArray(value)?value.map(String):String(value||'').split(';').map(x=>x.trim()).filter(Boolean)
export async function parseVaultImport(body){
 let records=[],text='',scope='full supplied text',speaker=body.kind==='capture'?'Member':'Unspecified',topic=String(body.title||'Imported conversation').slice(0,200),files=[]
 if(body.base64){
  const bytes=Buffer.from(body.base64,'base64');if(bytes.length>3500000)throw Error('Choose a file smaller than 3.5 MB.')
  const name=String(body.fileName||'source.txt').replace(/[\\/]/g,'_').slice(0,160)
  files=[{name,base64:bytes.toString('base64')}]
  if(/\.zip$/i.test(name)){
   const zip=await JSZip.loadAsync(bytes),entries=Object.values(zip.files).filter(x=>!x.dir)
   if(entries.length>30||entries.some(x=>(x._data?.uncompressedSize||0)>1500000)||entries.reduce((sum,x)=>sum+(x._data?.uncompressedSize||0),0)>4000000)throw Error('This archive is too large to import safely.')
   const structured=entries.filter(x=>/(^|\/)brevity_import\.json$/.test(x.name));if(structured.length!==1)throw Error('This ZIP must contain one brevity_import.json. Import a single conversation as text or JSON otherwise.')
   const parsed=JSON.parse(await structured[0].async('string'));records=parsed.records;topic=String(parsed.topic||topic).slice(0,200);scope='partial conversation extraction';speaker='Assistant'
   const source=entries.find(x=>/(^|\/)source_and_teachings\.md$/.test(x.name));text=source?await source.async('string'):''
   body={...body,date:parsed.date}
  }else if(/\.json$/i.test(name)){
   const parsed=JSON.parse(bytes.toString('utf8'))
   if(Array.isArray(parsed.records)){records=parsed.records;topic=String(parsed.topic||topic).slice(0,200);scope='partial conversation extraction';speaker='Unspecified';body={...body,date:parsed.date}}
   else if(parsed.mapping){topic=String(parsed.title||topic).slice(0,200);let id=parsed.current_node,turns=[],seen=new Set();while(id&&parsed.mapping[id]&&!seen.has(id)){seen.add(id);const node=parsed.mapping[id],m=node.message;if(m?.content?.parts)turns.unshift(`${m.author?.role||'unspecified'}: ${m.content.parts.filter(p=>typeof p==='string').join('\n')}`);id=node.parent}text=turns.join('\n\n')}
   else throw Error('Import a single ChatGPT conversation JSON or a Brevity discovery package.')
  }else if(/\.(txt|md)$/i.test(name))text=bytes.toString('utf8')
  else throw Error('Choose a ZIP discovery package, JSON, Markdown or text file.')
 }else text=required(body.text,'Source text')
 if(!Array.isArray(records)||records.length>500)throw Error('A collection can contain up to 500 discoveries.')
 if(records.length){const ids=new Set();records=records.map(row=>{if(!validId(row.id)||ids.has(row.id))throw Error('Discovery reference IDs must be unique.');ids.add(row.id);const quote=required(row.exact_quote,'Exact quote',12000);if(text&&!text.includes(quote))throw Error(`The supplied source does not contain the exact wording of ${row.id}.`);return {externalId:row.id,quote,cluster:String(row.cluster||'Unsorted').slice(0,150),speaker,scripture:tags(row.scripture),pillars:tags(row.pillar),sourceLabel:String(row.source||'Imported source').slice(0,500)}});if(!text)text=records.map(row=>row.quote).join('\n\n')}
 required(text,'Source text');const date=/^\d{4}-\d{2}-\d{2}$/.test(body.date||'')?body.date:null
 if(body.kind==='capture'&&!records.length)records=[{externalId:'capture',quote:text,cluster:'Personal insight',speaker:'Member',scripture:[],pillars:[],sourceLabel:'Direct capture'}]
 topic=required(topic,'Collection title',200)
 const fingerprint=hash(JSON.stringify([topic,text,records])),collectionId=`rv-${fingerprint.slice(0,32)}`
 return {id:collectionId,fingerprint,title:topic,date,scope,text,files,records,needsExtraction:records.length===0}
}
export function addImport(library,parsed,owner,actor,now=new Date()){
 if(library.collections.some(c=>c.id===parsed.id))return {library,alreadyImported:true}
 const collection={id:parsed.id,title:parsed.title,date:parsed.date||now.toISOString().slice(0,10),scope:parsed.scope,owner,createdBy:actor,createdAt:now.toISOString(),fingerprint:parsed.fingerprint,needsExtraction:parsed.needsExtraction,scriptureStatus:'Imported references — relevance requires review'}
 const discoveries=parsed.records.map(row=>({...row,authorName:row.speaker==='Member'?actor:'',id:`${parsed.id}-${row.externalId}`,collectionId:parsed.id,status:'To develop',reflection:'',createdAt:now.toISOString()}))
 return {library:{...library,revision:library.revision+1,collections:[collection,...library.collections],discoveries:[...discoveries,...library.discoveries]},alreadyImported:false}
}
export async function writeVault(store,key,entry,value){const result=await store.setJSON(key,value,entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true});if(result?.modified!==true){const error=Error('The vault changed on another device. Refresh and retry; your original source is retained.');error.status=409;throw error}}
export function extractionRecords(value,source,collectionId){
 if(!Array.isArray(value)||value.length>60)throw Error('The discovery extraction is invalid.')
 return value.map((row,index)=>{const quote=required(row.quote,'Extracted quote',12000);if(!source.includes(quote))throw Error('An extracted quotation did not match the preserved source. Nothing was added.');return {id:`${collectionId}-ex-${hash(quote).slice(0,20)}`,externalId:`EX-${index+1}`,collectionId,quote,cluster:String(row.cluster||'Unsorted').slice(0,150),speaker:['Member','Assistant','Unspecified'].includes(row.speaker)?row.speaker:'Unspecified',scripture:[],pillars:[],status:'To develop',reflection:'',sourceLabel:'Exact excerpt from preserved source'}})
}
export {randomUUID}
