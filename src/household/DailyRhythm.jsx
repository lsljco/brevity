import {HOUSEHOLD_SCHEDULE_STORAGE_KEY,normalizeHouseholdScheduleState,routineOccurrencesForDate} from './householdScheduleData.js'
import {SHARED_STATE_EVENT} from './sharedState.js'
import {stageDailyPlanReview} from './dailyPlanActionReview.js'
import PersonalReminders from '../notifications/PersonalReminders.jsx'
import {useEffect,useState} from 'react'
import {DAILY_BLOCKS,householdClock,isFinished,namedFor,rhythmItems,scheduleAFor,minuteOfDay} from './dailyRhythm.js'
import './DailyRhythm.css'
export default function DailyRhythm({plan,currentMember,chores=[],onOpenOperations,readOnly=true}){
 const [routines,setRoutines]=useState([])
 useEffect(()=>{const refresh=()=>{try{const state=normalizeHouseholdScheduleState(JSON.parse(localStorage.getItem(HOUSEHOLD_SCHEDULE_STORAGE_KEY)||'{}'));setRoutines(routineOccurrencesForDate(state,plan.date))}catch{setRoutines([])}};refresh();window.addEventListener(SHARED_STATE_EVENT,refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener(SHARED_STATE_EVENT,refresh);window.removeEventListener('storage',refresh)}},[plan.date])
 const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
 const [scope,setScope]=useState('mine'),[now,setNow]=useState(()=>householdClock())
 useEffect(()=>{if(new URLSearchParams(window.location.search).has('reminder'))document.getElementById('daily-rhythm')?.scrollIntoView({block:'start'})},[])
 useEffect(()=>{const timer=setInterval(()=>setNow(householdClock()),30000);return()=>clearInterval(timer)},[])
 const all=[...rhythmItems(plan,chores),...routines.map(x=>({...x,source:'routine',time:x.startTime,block:DAILY_BLOCKS.find(b=>(minuteOfDay(x.startTime)??0)>=b.start&&(minuteOfDay(x.startTime)??0)<b.end)?.id||'flex',details:x.notes?[x.notes]:[]}))].sort((a,b)=>(minuteOfDay(a.time)??1440)-(minuteOfDay(b.time)??1440)),items=scope==='mine'?all.filter(x=>namedFor(x,currentMember)):all
 const pending=items.filter(x=>!isFinished(x)),current=plan.date===now.date?pending.find(x=>{const start=minuteOfDay(x.time),end=minuteOfDay(x.endTime);return start!==null&&start<=now.minute&&end!==null&&end>now.minute}):null
 const next=pending.find(x=>minuteOfDay(x.time)!==null&&(plan.date!==now.date||minuteOfDay(x.time)>now.minute))
 const template=scheduleAFor(currentMember)
 const review=async operations=>{if(readOnly)return;setBusy(true);setNotice('');try{await stageDailyPlanReview({summary:`Review daily responsibilities for ${plan.date}`,operations,expectedVersion:Number(plan.version||0)});setNotice('Review the proposal in Action Mode. The plan changes only after approval.')}catch(error){setNotice(error.message)}finally{setBusy(false)}}
 const adopt=()=>{
  const missing=template.items.filter(item=>!(plan.assignments||[]).some(saved=>saved.source===item.source))
  if(!missing.length){setNotice('Schedule A responsibilities are already present. Review their saved times below.');return}
  review(missing.map(item=>{const {endTime,...fields}=item;return {type:'assignment.create',targetDate:plan.date,payload:{...fields,...(endTime?{endTime}:{}),date:plan.date,status:'pending',priority:'normal'},description:`${currentMember}: ${item.title} at ${item.startTime}`}}))
 }
 const complete=item=>review([{type:'assignment.update',targetDate:plan.date,targetId:item.id,payload:{status:'complete'},description:`Mark ${item.title} complete`}])
 return <section className="today-section daily-rhythm" id="daily-rhythm" aria-label="Daily rhythm">
  <div className="today-section-heading"><div><span>Household Management · {plan.date}</span><h2>Your Daily Rhythm</h2><p>Responsibilities live here. Appointments remain in Calendar.</p></div><label>View<select value={scope} onChange={e=>setScope(e.target.value)}><option value="mine">My responsibilities</option><option value="household">Household</option></select></label></div>
  <div className="rhythm-now"><div><span>Now</span><strong>{current?.title||'Check the current block below'}</strong></div><div><span>Next</span><strong>{next?`${next.time} · ${next.title}`:'No timed responsibility recorded'}</strong></div><div><span>Still to finish</span><strong>{pending.length} responsibilities</strong></div></div>
  {DAILY_BLOCKS.map(block=><details className="rhythm-block" key={block.id} open={plan.date===now.date&&now.minute>=block.start&&now.minute<block.end}><summary><strong>{block.label}</strong><span>{block.window} · {items.filter(x=>x.block===block.id).length} items</span></summary>{items.filter(x=>x.block===block.id).map(item=><article key={item.id}><div><strong>{item.title}</strong><p>{item.time||item.timing||'Time to be agreed'}{item.endTime?`–${item.endTime}`:''} · {item.owner||item.owners?.join(', ')||'Owner to be agreed'} · {item.status||'Planned'}</p></div>{item.details?.length>0&&<details><summary>What finished means</summary><ul>{item.details.map((detail,i)=><li key={i}>{detail}</li>)}</ul></details>}{item.source==='assignment'&&!readOnly&&<form onSubmit={event=>{event.preventDefault();const fields=new FormData(event.currentTarget);review([{type:'assignment.update',targetId:item.id,targetDate:plan.date,payload:{startTime:fields.get('startTime'),endTime:fields.get('endTime')},description:`Change timing for ${item.title}`}])}}><label>Start <input type="time" name="startTime" required defaultValue={item.startTime||''}/></label><label>Finish <input type="time" name="endTime" required defaultValue={item.endTime||''}/></label><button disabled={busy}>Review time change</button></form>}{item.source==='assignment'&&!readOnly&&!isFinished(item)&&<button disabled={busy} onClick={()=>complete(item)}>Review completion</button>}{item.source==='chore'&&onOpenOperations&&<button onClick={onOpenOperations}>Update responsibility</button>}</article>)}{!items.some(x=>x.block===block.id)&&<p>No responsibilities recorded in this block.</p>}</details>)}
  {items.some(x=>x.block==='rest')&&<details className="rhythm-block"><summary>Outside the four waking blocks</summary>{items.filter(x=>x.block==='rest').map(x=><p key={x.id}>{x.time} · {x.title} · {x.owner||x.owners?.join(', ')}</p>)}</details>}
  <PersonalReminders key={currentMember} currentMember={currentMember} />
  <p role="status">{notice}</p>
  <p>Protected rest: 8 PM–4 AM. Agree changes during Alignment.</p>
  <details className="rhythm-reference"><summary>Master Schedule A · original reference</summary><p>{template.group}. Wake by 4:24 AM. This reference does not create appointments or send reminders. Confirm changes to locations, participants and times in the dated plan.</p>{template.items.map(x=><article key={x.startTime}><strong>{x.startTime}{x.endTime?`–${x.endTime}`:''} · {x.title}</strong><p>{x.notes}</p></article>)}<button disabled={readOnly||busy||!template.items.length} onClick={adopt}>Review Schedule A for {currentMember} · {plan.date}</button><p>Other wake windows: B 4:25–4:44 AM (shorter gym); C 4:45–5:14 AM (local gym); D 5:15 AM onward (home or nearest-gym micro-session).</p></details>
 </section>
}
