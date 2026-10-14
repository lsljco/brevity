export const LEARNING_HUB_RESOURCE='shared:brevity_learning_hub_v1'
export const LEARNING_KINDS=['program','session','topic','resource','assignment']
export const LEARNERS=['Larry','Lorenzo','Terica','Nyla','Javin','Isaiah','Family']
export function normalizeLearningItem(payload){
 const allowed=['title','kind','owner','parentId','date','time','objective','nextStep','notes','url','status']
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!allowed.includes(key)))throw Error('Use the supported learning fields.')
 const item={kind:'topic',owner:'Family',status:'active',parentId:'',date:'',time:'',objective:'',nextStep:'',notes:'',url:'',...payload}
 if(typeof item.title!=='string'||!item.title.trim()||item.title.length>160)throw Error('A learning item needs a title of 1–160 characters.')
 if(!LEARNING_KINDS.includes(item.kind)||!LEARNERS.includes(item.owner)||!['active','complete','paused','archived'].includes(item.status))throw Error('Choose a valid learning type, learner and status.')
 for(const key of ['parentId','date','time','objective','nextStep','notes','url'])if(typeof item[key]!=='string'||item[key].length>(key==='notes'?10000:2000))throw Error(`Invalid ${key}.`)
 if(item.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||!Number.isFinite(Date.parse(item.date))||new Date(item.date).toISOString().slice(0,10)!==item.date))throw Error('Choose a valid date.')
 if(item.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time))throw Error('Choose a valid time.')
 if(item.url){let url;try{url=new URL(item.url)}catch{throw Error('Use a full resource URL.')}if(!['https:','http:'].includes(url.protocol))throw Error('Use an http or https resource URL.')}
 return {...item,title:item.title.trim()}
}
export function applyLearningItem(value,operation){
 const items=value?.items||[],current=items.find(item=>item.id===operation.targetId)
 if(operation.type==='education.hub.create'&&current)throw Error('This learning item already exists.')
 if(operation.type==='education.hub.update'&&!current)throw Error('This learning item no longer exists. Refresh first.')
 const item={...normalizeLearningItem(operation.payload),id:operation.targetId}
 if(item.parentId&&(item.parentId===item.id||!items.some(row=>row.id===item.parentId&&['program','topic'].includes(row.kind)&&row.status!=='archived')))throw Error('Choose an existing program or topic as the parent.')
 let parent=item.parentId;const seen=new Set([item.id]);while(parent){if(seen.has(parent))throw Error('Learning workspaces cannot contain a cycle.');seen.add(parent);parent=items.find(row=>row.id===parent)?.parentId}
 if(items.length>=2000&&!current)throw Error('Learning workspace limit reached.')
 return {...value,items:current?items.map(row=>row.id===item.id?item:row):[...items,item]}
}
export const learningForViewer=(items,member,scope='mine')=>(items||[]).filter(item=>item.status!=='archived'&&(scope==='household'||item.owner===member||item.owner==='Family'))
export function learningAgenda(items,date){const end=new Date(`${date}T12:00:00Z`);end.setUTCDate(end.getUTCDate()+7);const through=end.toISOString().slice(0,10),active=items.filter(item=>item.status==='active');return {today:active.filter(item=>item.date===date),upcoming:active.filter(item=>item.date>date&&item.date<=through).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)),attention:active.filter(item=>item.date&&item.date<date&&['assignment','session'].includes(item.kind)),focus:active.filter(item=>['program','topic'].includes(item.kind))}}
