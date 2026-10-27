import {useFamilyCalendarDay} from '../family/useFamilyCalendarDay.js'
import {minuteOfDay,isFinished} from './dailyRhythm.js'

const clock=value=>{const minute=minuteOfDay(value);if(minute===null)return '';const hour=Math.floor(minute/60);return `${hour%12||12}:${String(minute%60).padStart(2,'0')} ${hour>=12?'PM':'AM'}`}
const sourceLabel={appointment:'Calendar',assignment:'Assignment',routine:'Routine',block:'Scheduled block',chore:'Household',timeline:'Daily plan'}
export default function DayAgenda({date,calendarHealth,onOpenCalendar,onReview,planning}){
 const shown=useFamilyCalendarDay(date).map(item=>({...item,sourceKind:'appointment'}))
 return <section className="family-agenda" aria-label="Day schedule"><header><div><span className="family-eyebrow">One shared picture</span><h2>{planning?'The day ahead':'At a glance'}</h2><p>Family calendar · every commitment for this day</p></div><button onClick={onOpenCalendar}>Open calendar</button></header>
 {calendarHealth?.state!=='ready'&&<p className="family-source-notice" role="status">Calendar needs checking. This schedule may be incomplete.</p>}
 <ol className="family-agenda-list">{shown.map(item=>{const done=isFinished(item),time=clock(item.startTime||item.time);return <li key={`${item.source||item.sourceKind}:${item.id}`} className={done?'is-done':''}><div className="family-agenda-time"><time>{item.allDay?'All day':time||'Time to confirm'}</time>{item.endTime&&<small>{clock(item.endTime)}</small>}</div><div className="family-agenda-copy"><div className="family-agenda-meta"><span>{sourceLabel[item.sourceKind]||'Plan'}</span>{done&&<span>Completed</span>}{item.placeholder&&<span>Time held · confirm details</span>}</div><strong>{item.title}</strong><small>{item.displayOwners?.join(', ')||item.owner||'Owner to agree'}{item.location?` · ${item.location}`:''}</small>{item.notes&&<details><summary>Context &amp; preparation</summary><p>{item.notes}</p></details>}</div><button aria-label={`View scheduled item ${item.title}`} onClick={()=>onReview(item)}>View</button></li>})}</ol>
 {!shown.length&&<div className="family-empty"><strong>No Family calendar entries for this day.</strong><p>Open the calendar to add an event or browse other calendars.</p></div>}
 <footer><span>{shown.length} calendar {shown.length===1?'entry':'entries'}</span><span>From the Family calendar</span></footer></section>
}
