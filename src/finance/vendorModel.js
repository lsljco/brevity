import {isTransferTransaction} from './reportingData.js'

export const VENDOR_RESOURCE='vendors:household'
export const VENDOR_TYPES=['vendor.create','vendor.update','vendor.archive','vendor.expense.link','vendor.login.attach','vendor.document.attach','vendor.document.remove']
const members=['Larry','Lorenzo','Terica','Nyla','Javin','Isaiah']
const fields=['name','address','phone','email','website','paymentUrl','notes','accessMembers']
export const emptyVendors=()=>({vendors:[],links:{}})
const fail=message=>{throw new Error(message)}
const text=(value,max=500)=>{if(typeof value!=='string'||value.length>max||/[\u0000-\u0008]/.test(value))fail('Invalid vendor text.');return value.trim()}
const id=value=>{const result=text(value,200);if(!result||!/^[-a-zA-Z0-9_.:]+$/.test(result))fail('Invalid vendor reference.');return result}
export function normalizeVendorPayload(type,payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('Vendor details must be an object.')
 const allowed=type==='vendor.create'||type==='vendor.update'?fields:type==='vendor.expense.link'?['expenseKind','expenseId','vendorId']:type==='vendor.login.attach'?['blobId']:type==='vendor.document.attach'?['blobId','fileName','mimeType','size']:type==='vendor.document.remove'?['blobId']:[]
 if(Object.keys(payload).some(key=>!allowed.includes(key)))fail('Unsupported vendor details. Login secrets must use the protected upload form.')
 const result={}
 for(const [key,value] of Object.entries(payload)){
  if(key==='accessMembers'){if(!Array.isArray(value)||value.some(member=>!members.includes(member)))fail('Choose valid household members.');result[key]=[...new Set(value)]}
  else if(['vendorId','expenseId','blobId'].includes(key))result[key]=id(value)
  else if(key==='size'){if(!Number.isInteger(value)||value<1||value>3*1024*1024)fail('Documents must be at most 3 MB.');result[key]=value}
  else if(key==='website'||key==='paymentUrl'){const url=text(value,1000);if(url){let parsed;try{parsed=new URL(url)}catch{fail('Use a complete https website address.')};if(parsed.protocol!=='https:'||parsed.username||parsed.password)fail('Use an https website without embedded credentials.')}result[key]=url}
  else result[key]=text(value,key==='notes'?3000:key==='address'?1500:500)
 }
 if(type==='vendor.create'&&!result.name)fail('A vendor name is required.')
 if(type==='vendor.expense.link'&&(result.expenseKind!=='posted'||!result.expenseId||!result.vendorId))fail('Select an expense and vendor.')
 if(type==='vendor.login.attach'||type==='vendor.document.attach'||type==='vendor.document.remove'){if(!result.blobId)fail('A protected upload reference is required.')}
 if(type==='vendor.document.attach'&&(!result.fileName||!result.mimeType||!result.size))fail('Document details are required.')
 return result
}
export function applyVendorOperation(input,operation,createId){
 const value=structuredClone(input||emptyVendors()),payload=normalizeVendorPayload(operation.type,operation.payload||{})
 value.vendors ||= [];value.links ||= {}
 if(operation.type==='vendor.create'){
  if(value.vendors.some(v=>v.name.toLowerCase()===payload.name.toLowerCase()&&!v.archived))fail('A vendor with this name already exists. Open that vendor instead.')
  value.vendors.push({id:createId(),...payload,accessMembers:payload.accessMembers||[],documents:[],archived:false});return value
 }
 const target=operation.type==='vendor.expense.link'?payload.vendorId:operation.targetId
 const vendor=value.vendors.find(v=>v.id===target)
 if(!vendor||vendor.archived)fail('That vendor is unavailable. Refresh the vendor list.')
 if(operation.type==='vendor.update'){if(payload.name!==undefined&&(!payload.name||value.vendors.some(v=>v.id!==vendor.id&&!v.archived&&v.name.toLowerCase()===payload.name.toLowerCase())))fail('Choose a unique, non-empty vendor name.');Object.assign(vendor,payload)}
 else if(operation.type==='vendor.archive')vendor.archived=true
 else if(operation.type==='vendor.expense.link')value.links[`${payload.expenseKind}:${payload.expenseId}`]=vendor.id
 else if(operation.type==='vendor.login.attach')vendor.loginBlobId=payload.blobId
 else if(operation.type==='vendor.document.attach'){if(!(vendor.documents||[]).some(doc=>doc.blobId===payload.blobId))vendor.documents=[...(vendor.documents||[]),payload]}
 else if(operation.type==='vendor.document.remove')vendor.documents=(vendor.documents||[]).filter(doc=>doc.blobId!==payload.blobId)
 return value
}
export const vendorForExpense=(workspace,kind,expense)=>(kind==='planned'?expense.vendorId:workspace?.links?.[`${kind}:${expense.id}`])||''
export function vendorActivity(workspace,posted=[],planned=[],{dateFrom='',dateTo=''}={}){
 const seen=new Set(),rows=[]
 for(const tx of posted){
  if(!tx?.id||seen.has(tx.id)||isTransferTransaction(tx))continue
  seen.add(tx.id)
  if(dateFrom&&tx.date<dateFrom||dateTo&&tx.date>dateTo)continue
  const amount=Number(tx.amount)
  if(!Number.isFinite(amount))continue
  rows.push({...tx,expenseKind:'posted',vendorId:vendorForExpense(workspace,'posted',tx),signedAmount:amount})
 }
 const totals={}
 for(const row of rows){if(!row.vendorId)continue;const t=totals[row.vendorId]||{charges:0,credits:0,pending:0,net:0,count:0};if(row.pending)t.pending+=row.signedAmount;else{if(row.signedAmount>0)t.charges+=row.signedAmount;else t.credits-=row.signedAmount;t.net+=row.signedAmount;t.count++}totals[row.vendorId]=t}
 const plannedRows=planned.filter(tx=>tx.type==='expense').map(tx=>({...tx,expenseKind:'planned',vendorId:vendorForExpense(workspace,'planned',tx)}))
 return {rows,planned:plannedRows,totals,unassigned:[...rows.filter(tx=>!tx.vendorId&&tx.signedAmount>0),...plannedRows.filter(tx=>!tx.vendorId)]}
}

export function decorateVendorTransactions(records=[],workspace,kind='posted',order=''){
 const names=new Map((workspace?.vendors||[]).map(v=>[v.id,v.name]))
 const rows=records.map(tx=>{const vendorId=vendorForExpense(workspace,kind,tx);return {...tx,vendorId,vendorName:vendorId?names.get(vendorId)||'Unavailable vendor':'Unassigned'}})
 return order?[...rows].sort((a,b)=>(a.vendorName.localeCompare(b.vendorName,undefined,{sensitivity:'base'})||String(a.id).localeCompare(String(b.id)))*(order==='desc'?-1:1)):rows
}
