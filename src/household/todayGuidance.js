import {minuteOfDay,isFinished,namedFor} from './dailyRhythm.js'
import {rankDirectionPriorities} from './priorityDirection.js'
const list=value=>Array.isArray(value)?value:[]
export const belongsToDay=(item,date)=>!item.date||item.date===date
export const belongsToViewer=(item,member,scope='mine')=>scope==='household'||namedFor(item,member)||item.owner==='Family'||item.owners?.includes('Everyone')||(!item.owner&&!list(item.owners).length&&!list(item.participants).length)
const key=item=>`${item.sourceKind}:${item.id}`
export function dailyGuidance({plan,agenda,member,scope='mine',minute=0,openWork=[],signals=[]}){
 const datedWork=openWork.filter(item=>item.originalDate===plan.date&&item.source.kind!=='focus'&&belongsToViewer(item,member,scope)).map(item=>({...item,id:item.source.id,sourceKind:item.source.kind,date:item.originalDate,sourceDate:item.source.date}))
 const items=[...new Map([...datedWork,...agenda.priorities.filter(item=>belongsToViewer(item,member,scope)),...agenda.items].filter(item=>belongsToDay(item,plan.date)).map(item=>[key(item),item])).values()].sort((a,b)=>(minuteOfDay(a.startTime||a.time)??1440)-(minuteOfDay(b.startTime||b.time)??1440))
 const pending=items.filter(item=>!isFinished(item)&&!item.cancelled)
 const priorities=rankDirectionPriorities(agenda.priorities.filter(item=>belongsToDay(item,plan.date)&&belongsToViewer(item,member,scope)))
 const active=pending.filter(item=>{const start=minuteOfDay(item.startTime||item.time),end=minuteOfDay(item.endTime);return start!==null&&end!==null&&start<=minute&&minute<end})
 const future=pending.filter(item=>{const start=minuteOfDay(item.startTime||item.time);return start!==null&&start>minute})
 const flexible=pending.filter(item=>minuteOfDay(item.startTime||item.time)===null&&item.sourceKind!=='appointment')
 const earlier=pending.filter(item=>{const start=minuteOfDay(item.startTime||item.time),end=minuteOfDay(item.endTime);return start!==null&&(end??start)<=minute})
 const exceptions=[...signals.filter(item=>belongsToViewer(item,member,scope)).map(item=>({...item,sourceKind:'signal'})),...list(plan.household?.priorities).filter(item=>belongsToDay(item,plan.date)&&belongsToViewer(item,member,scope)&&!isFinished(item)&&!item.cancelled).map(item=>({...item,sourceKind:'priority'})),...list(plan.decisions).filter(item=>belongsToDay(item,plan.date)&&belongsToViewer(item,member,scope)&&!isFinished(item)&&!['resolved','done'].includes(String(item.status).toLowerCase())).map(item=>({...item,sourceKind:'decision'})),...pending.filter(item=>/needs.help|exception|returned|blocked|needs-decision/i.test(item.status||''))]
 const attention=[...new Map(exceptions.map(item=>[key(item),item])).values()]
 const focus=plan.household?.keyFocusCompleted||plan.household?.keyFocusDate>plan.date?'':String(plan.household?.keyFocus||'').trim()
 return {focus,priorities:priorities.slice(0,3),now:active[0]||null,suggested:rankDirectionPriorities(flexible)[0]||null,next:future[0]||null,remaining:[...active,...future,...flexible],earlier,attention,completed:items.filter(item=>['complete','completed','approved','done'].includes(String(item.status||'').toLowerCase())&&!item.cancelled)}
}

// Saved dated records only: no inference of schedules from a draft's creation date.
export function pillarDayItems(plan,pillar,member,scope='mine',appointments=[]){
 const section=plan[pillar]||{},records=[]
 const add=(items,kind)=>list(items).forEach((raw,index)=>{const item=typeof raw==='string'?{title:raw}:raw;if(!item||!belongsToDay(item,plan.date)||item.cancelled||['cancelled','canceled'].includes(String(item.status).toLowerCase()))return;const row={...item,id:item.id||`${pillar}:${kind}:${index}`,owner:item.owner||section.owner||'Family',sourceKind:kind};if(belongsToViewer(row,member,scope))records.push(row)})
 add(list(plan.assignments).filter(x=>x.pillar===pillar),'assignment')
 add(list(plan.topPriorities).filter(x=>x.pillar===pillar),'priority')
 add(section.priorities,'priority')
 if(pillar==='education')add(section.activities,'activity')
 if(pillar==='ministry'){add(section.meetings,'meeting');add(section.events,'event');add(section.contentCreation,'content');add(section.fellowshipFollowUps,'follow-up')}
 add(appointments.filter(x=>x.pillar===pillar),'appointment')
 return [...new Map(records.map(item=>[key(item),item])).values()]
}
