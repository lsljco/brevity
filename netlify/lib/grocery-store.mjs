import {randomUUID} from 'node:crypto'
import {GROCERY_CATEGORIES} from '../../src/household/groceryData.js'
const bad=message=>Object.assign(Error(message),{status:400})
const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw bad('Enter a valid grocery item and quantity.');return value.trim()}
export function validateGroceryItem(value){
 if(!value||typeof value!=='object')throw bad('Provide a grocery item.')
 const category=value.category||'Other'
 if(!GROCERY_CATEGORIES.includes(category))throw bad('Choose a grocery category.')
 if(value.sources!==undefined&&(!Array.isArray(value.sources)||value.sources.length>100))throw bad('Too many meal references.')
 return {name:text(value.name,500,true),quantity:text(value.quantity,120,true),category,sourceKey:text(value.sourceKey||'',1200),sources:(value.sources||[]).map(v=>text(v,700)),notes:text(value.notes||'',1000)}
}
export function createGroceryRepository({store,householdId='lslj-family',now=()=>new Date(),createId=randomUUID}){
 const storageKey=`${householdId.replace(/[^a-zA-Z0-9_-]/g,'-')}/grocery-list`
 const readEntry=()=>store.getWithMetadata(storageKey,{type:'json'})
 const read=async()=>{const entry=await readEntry();return entry?.data||{version:0,items:[]}}
 const mutate=async(input,actor)=>{
  if(!input||typeof input!=='object')throw bad('Provide a grocery request.')
  let incoming
  if(input.action==='add'){
   if(!Array.isArray(input.items)||!input.items.length||input.items.length>500)throw bad('Select between 1 and 500 grocery items.')
   incoming=input.items.map(validateGroceryItem)
  }else if(input.action!=='update')throw bad('Unknown grocery action.')
  for(let attempt=0;attempt<4;attempt++){
   const entry=await readEntry(),current=entry?.data||{version:0,items:[]},items=[...current.items],stamp=now().toISOString()
   let added=0,skipped=0
   if(incoming){
    for(const item of incoming){
     if(item.sourceKey&&items.some(row=>row.sourceKey===item.sourceKey)){skipped++;continue}
     items.push({...item,id:createId(),completed:false,revision:1,createdAt:stamp,createdBy:actor,updatedAt:stamp,updatedBy:actor});added++
    }
    if(items.length>3000)throw bad('The grocery list has reached its item limit.')
    if(!added)return {...current,added,skipped}
   }else{
    const index=items.findIndex(item=>item.id===input.id)
    if(index<0)throw Object.assign(Error('That grocery item was not found.'),{status:404})
    if(input.revision!==items[index].revision)throw Object.assign(Error('This item changed on another device. Refresh the list before editing it.'),{status:409})
    const patch=input.patch
    if(!patch||Object.keys(patch).some(key=>!['quantity','completed'].includes(key)))throw bad('Only quantity and purchased status can be updated.')
    if(patch.quantity!==undefined)text(patch.quantity,120,true)
    if(patch.completed!==undefined&&typeof patch.completed!=='boolean')throw bad('Purchased status must be true or false.')
    items[index]={...items[index],...patch,revision:items[index].revision+1,updatedAt:stamp,updatedBy:actor}
   }
   const next={version:current.version+1,items,updatedAt:stamp,updatedBy:actor}
   const result=await store.setJSON(storageKey,next,entry?{onlyIfMatch:entry.etag}:{onlyIfNew:true})
   if(result?.modified!==false)return {...next,added,skipped}
  }
  throw Object.assign(Error('The grocery list changed while saving. Please retry.'),{status:409})
 }
 return {read,mutate}
}
