import {useLearningHub} from '../education/useLearningHub.js'
import {learningForViewer} from '../education/learningHub.js'
import {pillarDayItems} from './todayGuidance.js'
import {requestAssistantConversation} from '../assistant/actionEvents.js'
export default function TodayPillarDetails({pillar,plan,currentMember,scope,appointments,onOpenPillar}){
 const education=pillar==='education',section=plan[pillar]||{},items=pillarDayItems(plan,pillar,currentMember,scope,appointments)
 const learning=useLearningHub(education),learningToday=learningForViewer(learning.items,currentMember,scope).filter(item=>item.date===plan.date&&item.status==='active')
 const title=education?'Education':'Ministry & Fellowship',number=education?5:7
 const prayers=Array.isArray(section.prayerNeeds)?section.prayerNeeds:[]
 return <section className="today-section today-pillar-brief today-dated-pillar" data-pillar={pillar} aria-label={`Pillar ${number} ${title}`}><header className="today-section-heading"><div><span>Pillar {number} · {title}</span><h2>{education?'Think Tank & education priorities':'Content creation & events'}</h2></div><button onClick={()=>onOpenPillar?.(pillar)} aria-label={`Open ${title}`}>Open {title}</button></header>
 {education?<div><h3>{section.thinkTankTopic||'No Think Tank topic recorded for this day.'}</h3>{section.thinkTankDeliverable&&<p>{section.thinkTankDeliverable}</p>}{section.isaiah&&<details><summary>Isaiah’s learning plan</summary><p>{[['readingMinutes','reading'],['sightWordsMinutes','sight words'],['comprehensionMinutes','comprehension'],['mathMinutes','math']].filter(([key])=>Number(section.isaiah[key])>0).map(([key,label])=>`${section.isaiah[key]} min ${label}`).join(' · ')||'No practice durations recorded.'}</p>{section.isaiah.notes&&<p>{section.isaiah.notes}</p>}</details>}</div>:section.contentFocus&&<div><h3>Today’s content focus</h3><p>{section.contentFocus}</p></div>}
 {education&&learning.error&&<p role="alert">{learning.error} <button onClick={learning.reload}>Retry learning</button></p>}
 {education&&learningToday.length>0&&<ul className="today-pillar-day-list">{learningToday.map(item=><li key={item.id}><div><strong>{item.title}</strong><small>{item.owner} · {item.time||'Flexible'}{item.nextStep?` · ${item.nextStep}`:''}</small></div><button onClick={()=>onOpenPillar?.('education')}>Open learning</button></li>)}</ul>}
 {items.length?<ul className="today-pillar-day-list">{items.map(item=><li key={`${item.sourceKind}:${item.id}`}><div><strong>{item.title||item.name}</strong><small>{item.startTime||item.time||'Time not specified'} · {item.owner}{item.status?` · ${item.status}`:''}</small></div><button onClick={()=>requestAssistantConversation(`Review ${pillar} item ${item.title||item.name} on ${plan.date}, source ${item.sourceKind}, exact ID ${item.id}. Read the saved record and help me update it through the existing reviewed workflow.`)}>Review</button></li>)}</ul>:<p>{education?'No additional education priorities recorded for this day.':'No content creation tasks or events recorded for this day.'}</p>}
 {!education&&prayers.length>0&&<details className="today-prayer-needs"><summary>View all {prayers.length} prayer needs</summary><ol>{prayers.map((item,index)=><li key={item.id||index}>{typeof item==='string'?item:item.title||item.name}</li>)}</ol></details>}
 </section>
}
