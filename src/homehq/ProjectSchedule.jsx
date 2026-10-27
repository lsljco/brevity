import {useEffect,useRef,useState} from 'react'
import {projectCalendarEvent} from './projectData.js'
import {projectUpdateOperation,requestProjectActionReview} from './projectActionReview.js'
import './ProjectSchedule.css'

export default function ProjectSchedule({project,onClose}) {
 const dialog=useRef(null)
 const [date,setDate]=useState(project.startDate||project.due||'')
 const [endDate,setEndDate]=useState(project.due||project.startDate||'')
 const [allDay,setAllDay]=useState(project.allDay!==false)
 const [startTime,setStartTime]=useState(project.startTime||'')
 const [endTime,setEndTime]=useState(project.endTime||'')
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{const previous=document.activeElement;dialog.current.showModal();return()=>previous?.focus?.()},[])
 const submit=async event=>{
  event.preventDefault();if(busy)return
  const draft={...project,startDate:date,due:endDate||date,allDay,startTime:allDay?'':startTime,endTime:allDay?'':endTime,pushToFamilyCalendar:true}
  if(!projectCalendarEvent(draft)){setError('Choose valid dates and, for a timed item, a start and end time with the end after the start.');return}
  setBusy(true);setError('')
  try{await requestProjectActionReview({summary:`Schedule ${project.title} on the Family Calendar`,operation:projectUpdateOperation(project,draft)});onClose()}
  catch(cause){setError(cause.message||'The calendar change could not be prepared. Try again.')}
  finally{setBusy(false)}
 }
 return <dialog ref={dialog} className="project-schedule-dialog" aria-labelledby="project-schedule-title" onCancel={event=>{event.preventDefault();if(!busy)onClose()}}>
  <form onSubmit={submit}><header><div><span>Family Calendar</span><h2 id="project-schedule-title">{project.pushToFamilyCalendar?'Reschedule':'Add to calendar'}</h2><p>{project.title}</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="Close project scheduling">Close</button></header>
  <div className="project-schedule-fields"><label>Start date<input autoFocus type="date" required value={date} onChange={event=>{const value=event.target.value;setDate(value);if(!endDate||endDate<value)setEndDate(value)}}/></label><label>End date<input type="date" required min={date} value={endDate} onChange={event=>setEndDate(event.target.value)}/></label><label className="project-schedule-all-day"><input type="checkbox" checked={allDay} onChange={event=>setAllDay(event.target.checked)}/>All day</label>{!allDay&&<><label>Start time<input type="time" required value={startTime} onChange={event=>setStartTime(event.target.value)}/></label><label>End time<input type="time" required value={endTime} onChange={event=>setEndTime(event.target.value)}/></label></>}</div>
  <p>Times use the household time zone. This updates the existing project and its Family Calendar entry. Apple Calendar publication remains a separate reviewed action.</p>
  {error&&<p role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" disabled={busy}>{busy?'Preparing…':'Review schedule'}</button></footer></form>
 </dialog>
}
