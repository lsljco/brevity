import {useState} from 'react'
import {groupTodayItems} from './todayPresentation.js'
import {minuteOfDay,isFinished} from './dailyRhythm.js'

const clock=value=>{const minute=minuteOfDay(value);if(minute===null)return '';const hour=Math.floor(minute/60);return `${hour%12||12}:${String(minute%60).padStart(2,'0')} ${hour>=12?'PM':'AM'}`}
const sourceLabel={appointment:'Calendar',assignment:'Assignment',routine:'Routine',block:'Scheduled block',chore:'Household',timeline:'Daily plan'}
export default function DayAgenda({agenda,date,calendarHealth,onOpenCalendar,onReview,scope,member,planning}){
 const [expanded,setExpanded]=useState(false)
 const items=groupTodayItems(agenda.items.filter(x=>(!x.date||x.date===date)&&!x.cancelled&&!['cancelled','canceled'].includes(x.status)))
 const timed=items.filter(x=>minuteOfDay(x.startTime||x.time)!==null||x.allDay)
 const shown=expanded?timed:timed.slice(0,6)
 return <section className="family-agenda" aria-label="Day schedule"><header><div><span className="family-eyebrow">One shared picture</span><h2>{planning?'The day ahead':'At a glance'}</h2><p>{scope==='household'?'Household commitments':`${member}’s commitments + shared family plans`}</p></div><button onClick={onOpenCalendar}>Open calendar</button></header>
 {calendarHealth?.state!=='ready'&&<p className="family-source-notice" role="status">Calendar needs checking. This schedule may be incomplete.</p>}
 <ol className="family-agenda-list">{shown.map(item=>{const done=isFinished(item),time=clock(item.startTime||item.time);return <li key={`${item.sourceKind}:${item.id}`} className={done?'is-done':''}><div className="family-agenda-time"><time>{item.allDay?'All day':time}</time>{item.endTime&&<small>{clock(item.endTime)}</small>}</div><div className="family-agenda-copy"><div className="family-agenda-meta"><span>{sourceLabel[item.sourceKind]||'Plan'}</span>{done&&<span>Completed</span>}{item.placeholder&&<span>Time held · confirm details</span>}</div><strong>{item.title}</strong><small>{item.displayOwners?.join(', ')||item.owner||'Owner to agree'}{item.location?` · ${item.location}`:''}</small>{item.notes&&<details><summary>Context &amp; preparation</summary><p>{item.notes}</p></details>}</div><button aria-label={`View scheduled item ${item.title}`} onClick={()=>onReview(item)}>View</button></li>})}</ol>
 {!timed.length&&<div className="family-empty"><strong>No timed commitments recorded.</strong><p>Confirm appointments and add times in the calendar or the responsibility’s source.</p></div>}
 {timed.length>6&&<button className="family-show-day" onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':`View all ${timed.length} timed commitments`}</button>}
 <footer><span>{timed.length} timed {timed.length===1?'commitment':'commitments'}</span><span>Times come from the saved schedule</span></footer></section>
}
