const list=value=>Array.isArray(value)?value:[]
const closed=item=>item.cancelled===true||['done','complete','completed','approved','cancelled','canceled'].includes(String(item.status||'').toLowerCase())
const clean=value=>String(value||'').trim()
const routine=item=>item.routineId||item.sourceType==='routine'||item.recurring===true||item.recurrence
const planFields=['id','title','notes','owner','participants','status','priority','date','startTime','endTime','dueAt','requiresDecision','calendarSync','notificationLevel']
const safeItem=item=>Object.fromEntries(Object.entries(item).filter(([key])=>planFields.includes(key)))
export function openWorkForDate({plans=[],projects=[],projectVersion=0,date}){
 const records=new Map()
 const add=(item,source,operation,expectedVersion)=>{
  if(!clean(item.title)||routine(item))return
  const key=source.kind==='project'?`project:${item.id}`:source.kind==='focus'?`focus:${clean(item.owner||'Family')}:${clean(item.title).toLowerCase()}`:`${source.kind}:${item.id}`
  records.set(key,{id:key,title:item.title,notes:item.notes||'',owner:item.owner||'Family',participants:list(item.participants),status:item.status||'pending',priority:item.priority||'normal',originalDate:item.date||source.date,source,operation,expectedVersion,closed:closed(item)})
 }
 for(const plan of [...plans].filter(p=>p?.date&&p.date<=date).sort((a,b)=>a.date.localeCompare(b.date))){
  const op=(type,targetId,payload)=>({type,targetId,targetDate:plan.date,payload,description:'Mark the original saved work complete; stop its daily carry-forward.'})
  const priorities=list(plan.topPriorities).length?plan.topPriorities:list(plan.household?.priorities)
  for(const item of priorities)if(item.id)add(item,{kind:'priority',date:plan.date,id:item.id},op('plan.pillar.update','household',{pillar:'household',patch:{priorities:priorities.map(x=>safeItem(x.id===item.id?{...x,status:'complete'}:x))}}),plan.version)
  for(const item of list(plan.assignments))if(item.id)add(item,{kind:'assignment',date:plan.date,id:item.id},op('assignment.update',item.id,{status:'complete'}),plan.version)
  if(clean(plan.household?.keyFocus))add({title:plan.household.keyFocus,owner:plan.household.owner||'Family',date:plan.household.keyFocusDate||plan.date,status:plan.household.keyFocusCompleted?'complete':'pending'},{kind:'focus',date:plan.date,id:'household'},op('plan.pillar.update','household',{pillar:'household',patch:{keyFocusCompleted:true}}),plan.version)
 }
 for(const item of list(projects)){
  const scheduled=item.startDate||item.due
  if(!scheduled||!item.id)continue
  const owners=list(item.raci?.responsible),owner=owners[0]||item.assignee||'Family'
  add({...item,owner,participants:[...owners.slice(1),...list(item.raci?.accountable)],date:scheduled},{kind:'project',date:scheduled,id:item.id,endDate:item.due||scheduled},{type:'project.update',targetId:item.id,payload:{status:'Done'},description:`Mark ${item.title} complete.`},projectVersion)
 }
 return [...records.values()].filter(x=>!x.closed&&x.originalDate<=date).map(({closed,...item})=>({...item,carriedForward:item.originalDate<date})).sort((a,b)=>a.originalDate.localeCompare(b.originalDate)||a.title.localeCompare(b.title))
}

export function rescheduleOpenWork(item,date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Choose a valid date.')
 const operation=JSON.parse(JSON.stringify(item.operation))
 operation.description=`Reschedule ${item.title} for ${date}; retain the original saved record.`
 if(item.source.kind==='assignment')operation.payload={date,status:'pending'}
 else if(item.source.kind==='priority')operation.payload.patch.priorities=operation.payload.patch.priorities.map(x=>x.id===item.source.id?{...x,date,status:item.status}:x)
 else if(item.source.kind==='focus')operation.payload={pillar:'household',patch:{keyFocusDate:date}}
 else if(item.source.kind==='project'){
  const duration=Math.max(0,Date.parse(item.source.endDate)-Date.parse(item.source.date))
  operation.payload={date,endDate:new Date(Date.parse(date)+duration).toISOString().slice(0,10)}
 }else throw Error('This work cannot be rescheduled here.')
 return operation
}
