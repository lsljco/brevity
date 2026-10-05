export const CARE_MEMBERS=['Larry','Lorenzo','Terica','Nyla','Javin','Isaiah']
export const CARE_STATUSES=['Needs scheduling','Scheduled','Needs review','Completed']
export const CARE_TYPES=['Medical','Dental','Eye care','Other']
export function carePriorities(items,date){return items.filter(x=>x.status!=='Completed').sort((a,b)=>Number(b.priority==='High')-Number(a.priority==='High')||Number(Boolean(b.date&&b.date<date))-Number(Boolean(a.date&&a.date<date))||(a.date||'9999').localeCompare(b.date||'9999'))}
export function normalizeCare(input){
 const text=(x,n=240)=>String(x||'').trim().slice(0,n)
 const item={title:text(input.title),member:text(input.member),type:text(input.type),status:text(input.status),priority:input.priority==='High'?'High':'Normal',date:text(input.date,10),notes:text(input.notes,2000)}
 if(!item.title||!CARE_MEMBERS.includes(item.member)||!CARE_TYPES.includes(item.type)||!CARE_STATUSES.includes(item.status))throw Error('Choose a title, household member, care type and status.')
 if(item.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||!Number.isFinite(Date.parse(item.date))||new Date(item.date).toISOString().slice(0,10)!==item.date))throw Error('Choose a valid date.')
 if(item.status==='Scheduled'&&!item.date)throw Error('Scheduled care needs an appointment date.')
 return item
}
export const CARE_RESOURCE='health:care'
export function normalizeCareAction(payload){
 if(!payload||Object.keys(payload).some(key=>!['title','member','type','status','priority','date','notes'].includes(key)))throw Error('Unsupported shared care fields.')
 return normalizeCare(payload)
}
export function applyCareAction(value,operation,{actor,now,createId}){
 const prior=value||{items:[],audit:[]},items=prior.items||[],before=items.find(item=>item.id===operation.targetId)
 if(operation.type==='health.care.update'&&!before)throw Error('This care item no longer exists.')
 if(operation.type==='health.care.create'&&before)throw Error('This care item already exists. Refresh before adding it.')
 const at=now().toISOString(),saved={...normalizeCareAction(operation.payload),id:before?.id||operation.targetId||createId(),updatedAt:at,updatedBy:actor}
 return {...prior,items:before?items.map(item=>item.id===before.id?saved:item):[...items,saved],audit:[...(prior.audit||[]),{at,actor,before:before||null,after:saved}].slice(-200)}
}
