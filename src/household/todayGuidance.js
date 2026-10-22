import {todayCalendarAppointments} from './todayCalendar.js'
import {isPersonalItem,groupTodayItems,focusBubbles} from './todayPresentation.js'
import {minuteOfDay,isFinished,namedFor} from './dailyRhythm.js'
import {rankDirectionPriorities} from './priorityDirection.js'
const list=value=>Array.isArray(value)?value:[]
export const belongsToDay=(item,date)=>!item.date||item.date===date
export const belongsToViewer=(item,member,scope='mine')=>scope==='household'||namedFor(item,member)||item.owner==='Family'||item.owners?.includes('Everyone')||(!item.owner&&!list(item.owners).length&&!list(item.participants).length)
const key=item=>`${item.sourceKind}:${item.id}`
export function dailyGuidance({plan,agenda,member,scope='mine',minute=0,openWork=[],signals=[],chores=[]}){
 const datedWork=openWork.filter(item=>item.originalDate===plan.date&&item.source.kind!=='focus'&&belongsToViewer(item,member,scope)).map(item=>({...item,id:item.source.id,sourceKind:item.source.kind,date:item.originalDate,sourceDate:item.source.date}))
 const items=[...new Map([...datedWork,...agenda.priorities.filter(item=>belongsToViewer(item,member,scope)),...agenda.items].filter(item=>belongsToDay(item,plan.date)&&(scope==='household'||(item.sourceKind==='appointment'?todayCalendarAppointments([item],member).length>0:isPersonalItem(item,member)))).map(item=>[key(item),item])).values()].sort((a,b)=>(minuteOfDay(a.startTime||a.time)??1440)-(minuteOfDay(b.startTime||b.time)??1440))
 const pending=items.filter(item=>!isFinished(item)&&!item.cancelled&&!['done','canceled'].includes(String(item.status||'').toLowerCase()))
 const priorities=rankDirectionPriorities(agenda.priorities.filter(item=>belongsToDay(item,plan.date)&&(scope==='household'||isPersonalItem(item,member))))
 const active=pending.filter(item=>{const start=minuteOfDay(item.startTime||item.time),end=minuteOfDay(item.endTime);return start!==null&&end!==null&&start<=minute&&minute<end})
 const future=pending.filter(item=>{const start=minuteOfDay(item.startTime||item.time);return start!==null&&start>minute})
 const untimed=pending.filter(item=>minuteOfDay(item.startTime||item.time)===null)
 const flexible=untimed.filter(item=>item.sourceKind!=='appointment')
 const earlier=pending.filter(item=>{const start=minuteOfDay(item.startTime||item.time),end=minuteOfDay(item.endTime);return start!==null&&(end??start)<=minute})
 const signoffs=chores.filter(item=>item.verifiers?.includes(member)&&item.occurrence?.submittedAt&&!item.occurrence?.approvedAt&&!item.occurrence?.returnedAt).map(item=>({...item,id:item.occurrenceId||item.id,sourceKind:'signoff',owner:member,title:`Sign-off: ${item.title}`}))
 const exceptions=[...signoffs,...signals.filter(item=>belongsToViewer(item,member,scope)).map(item=>({...item,sourceKind:'signal'})),...list(plan.household?.priorities).filter(item=>belongsToDay(item,plan.date)&&belongsToViewer(item,member,scope)&&!isFinished(item)&&!item.cancelled).map(item=>({...item,sourceKind:'priority'})),...list(plan.decisions).filter(item=>belongsToDay(item,plan.date)&&belongsToViewer(item,member,scope)&&!isFinished(item)&&!['resolved','done'].includes(String(item.status).toLowerCase())).map(item=>({...item,sourceKind:'decision'})),...pending.filter(item=>['high','critical'].includes(item.priority)),...pending.filter(item=>/needs.help|exception|returned|blocked|needs-decision/i.test(item.status||''))]
 const attention=[...new Map(exceptions.filter(item=>(scope==='household'||namedFor(item,member))&&!(item.sourceKind==='signal'&&item.action==='household')&&!(['Larry','Terica'].includes(member)&&['chore','routine'].includes(item.sourceKind))).map(item=>[key(item),item])).values()]
 const present=rows=>scope==='household'?groupTodayItems(rows):rows
 const focus=plan.household?.keyFocusCompleted||plan.household?.keyFocusDate>plan.date?'':String(plan.household?.keyFocus||'').trim()
 // Prefer a unique exact focus match among equally urgent flexible work. Keep source IDs intact.
 const focusMatches=focus?flexible.filter(item=>item.title===focus):[]
 const suggested=rankDirectionPriorities(focusMatches.length===1?[focusMatches[0],...flexible.filter(item=>item!==focusMatches[0])]:flexible)[0]||null
 return {focus,focusItems:focusBubbles(focus,priorities),priorities:groupTodayItems(priorities).slice(0,3),now:active[0]||null,suggested,next:future[0]||null,remaining:present([...active,...future,...untimed]),earlier:present(earlier),attention:groupTodayItems(attention),completed:items.filter(item=>['complete','completed','approved','done'].includes(String(item.status||'').toLowerCase())&&!item.cancelled)}
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
