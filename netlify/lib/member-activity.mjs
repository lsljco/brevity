export const ACTIVITY_KINDS=['workout','progress','maintenance','study-note','sermon-note','ministry-followup','expense','sleep','hydration','module-note']
export function normalizeActivityPayload(type,payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Activity details are required.')
 const allowed=type==='activity.remove'?['entryId','reason']:['entryId','kind','title','notes','durationMinutes','quantity','unit','amount','currency','status','moduleId']
 const result={}
 for(const [key,value] of Object.entries(payload)){
  if(!allowed.includes(key))throw Error(`Unsupported activity field: ${key}.`)
  if(['durationMinutes','quantity','amount'].includes(key)){
   if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>(key==='durationMinutes'?1440:1000000))throw Error(`Invalid ${key}.`)
   result[key]=value
  }else{if(typeof value!=='string'||value.length>2000)throw Error(`Invalid ${key}.`);result[key]=value.trim()}
 }
 if(type!=='activity.record'&&!result.entryId)throw Error('Find the exact saved activity before changing it.')
 if(type==='activity.record'&&(!ACTIVITY_KINDS.includes(result.kind)||!result.title))throw Error('An activity needs a supported kind and descriptive title.')
 if(result.kind&&!ACTIVITY_KINDS.includes(result.kind))throw Error('Unsupported activity kind.')
 if(result.status&&!['reported','complete','pending'].includes(result.status))throw Error('Activity status must be reported, complete or pending.')
 if(result.currency&&!/^[A-Z]{3}$/.test(result.currency))throw Error('Use a three-letter currency code.')
 if(result.moduleId&&!/^custom-[a-z0-9-]{1,60}$/.test(result.moduleId))throw Error('Choose a custom module ID.')
 if(result.kind==='module-note'&&!result.moduleId)throw Error('A module note requires its custom module ID.')
 if('title' in result&&!result.title)throw Error('An activity title cannot be empty.')
 if(type==='activity.record'&&result.quantity!==undefined&&!result.unit)throw Error('Ask which unit was measured before recording a quantity.')
 if(result.kind==='expense'&&(result.amount===undefined||!result.currency))throw Error('A reported expense needs amount and currency; it never moves money or changes bank transactions.')
 if(type==='activity.remove'&&!result.reason)throw Error('Explain the activity removal.')
 return result
}
export function applyActivity(value,operation,{actor,now,createId}){
 const payload=normalizeActivityPayload(operation.type,operation.payload),entries=structuredClone(value?.entries||[]),at=now().toISOString()
 if(operation.type==='activity.record'){
  if(entries.length>=250)throw Error('This day has reached its activity limit.')
  const {entryId,...data}=payload
  entries.push({...data,id:createId(),member:operation.targetId,date:operation.targetDate,createdBy:actor,createdAt:at,basis:'Member-reported; not independently verified'})
 }else{
  const index=entries.findIndex(item=>item.id===payload.entryId)
  if(index<0)throw Error('That saved activity is no longer available.')
  if(operation.type==='activity.remove')entries.splice(index,1)
  else{const {entryId,...patch}=payload;if(patch.kind&&patch.kind!==entries[index].kind)throw Error('An activity correction cannot change its record kind.');const combined={...entries[index],...patch};normalizeActivityPayload('activity.record',Object.fromEntries(Object.entries(combined).filter(([key])=>['kind','title','notes','durationMinutes','quantity','unit','amount','currency','status','moduleId'].includes(key))));entries[index]={...combined,updatedBy:actor,updatedAt:at}}
 }
 return {...value,member:operation.targetId,date:operation.targetDate,entries}
}
