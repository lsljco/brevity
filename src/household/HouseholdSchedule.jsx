import { useEffect, useMemo, useState } from 'react'
import { HOUSEHOLD_MEMBERS } from '../homehq/projectData.js'
import { SHARED_STATE_EVENT } from './sharedState.js'
import {
  HOUSEHOLD_SCHEDULE_STORAGE_KEY,
  WEEKDAYS,
  createRoutine,
  createScheduleBlock,
  deleteRoutine,
  deleteScheduleBlock,
  invitationsForMember,
  normalizeHouseholdScheduleState,
  overrideRoutineOccurrence,
  publishHouseholdScheduleEvents,
  respondToInvitation,
  scheduleForMember,
  updateRoutine,
  updateScheduleBlock,
} from './householdScheduleData.js'
import './HouseholdSchedule.css'

const PILLARS = ['Spiritual Maturity','Health & Nutrition','Physical Fitness','Household Management','Education','Finance','Ministry & Fellowship']
const HOURS = Array.from({length:18},(_,index)=>index+5)
const emptyBlock = member => ({ title:'', date:new Date().toISOString().slice(0,10), startTime:'09:00', endTime:'10:00', owner:member, participants:[], pillar:'Household Management', notes:'' })
const emptyRoutine = member => ({ title:'', owner:member, participants:[], days:[1,2,3,4,5], startTime:'07:00', endTime:'08:00', pillar:'Household Management', notes:'', enabled:true })

function loadState(){try{return normalizeHouseholdScheduleState(JSON.parse(localStorage.getItem(HOUSEHOLD_SCHEDULE_STORAGE_KEY)||'{}'))}catch{return normalizeHouseholdScheduleState()}}
const timeLabel=value=>{const [hour,minute]=String(value||'00:00').split(':').map(Number);return new Date(2000,0,1,hour,minute).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
const hourLabel=hour=>new Date(2000,0,1,hour,0).toLocaleTimeString('en-US',{hour:'numeric'})
const minutes=value=>{const [h,m]=String(value||'00:00').split(':').map(Number);return h*60+m}

export default function HouseholdSchedule({ currentMember, mode='schedule' }){
  const [state,setState]=useState(loadState)
  const [date,setDate]=useState(new Date().toISOString().slice(0,10))
  const [blockForm,setBlockForm]=useState(()=>emptyBlock(currentMember))
  const [routineForm,setRoutineForm]=useState(()=>emptyRoutine(currentMember))
  const [showAdd,setShowAdd]=useState(false)
  const [editingId,setEditingId]=useState('')

  useEffect(()=>{setBlockForm(form=>({...form,owner:currentMember,date}));setRoutineForm(form=>({...form,owner:currentMember}))},[currentMember])
  useEffect(()=>{const refresh=event=>{if(event.type==='storage'&&event.key!==HOUSEHOLD_SCHEDULE_STORAGE_KEY)return;if(event.type===SHARED_STATE_EVENT&&!event.detail?.keys?.includes(HOUSEHOLD_SCHEDULE_STORAGE_KEY))return;setState(loadState())};window.addEventListener('storage',refresh);window.addEventListener(SHARED_STATE_EVENT,refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener(SHARED_STATE_EVENT,refresh)}},[])
  useEffect(()=>{if(!localStorage.getItem(HOUSEHOLD_SCHEDULE_STORAGE_KEY))localStorage.setItem(HOUSEHOLD_SCHEDULE_STORAGE_KEY,JSON.stringify(state));publishHouseholdScheduleEvents(localStorage,state)},[])

  const persist=next=>{const normalized=normalizeHouseholdScheduleState(next);setState(normalized);localStorage.setItem(HOUSEHOLD_SCHEDULE_STORAGE_KEY,JSON.stringify(normalized));publishHouseholdScheduleEvents(localStorage,normalized)}
  const schedule=useMemo(()=>scheduleForMember(state,date,currentMember),[state,date,currentMember])
  const invites=useMemo(()=>invitationsForMember(state,currentMember).sort((a,b)=>`${a.date}-${a.startTime}`.localeCompare(`${b.date}-${b.startTime}`)),[state,currentMember])
  const memberRoutines=useMemo(()=>state.routines.filter(item=>item.owner===currentMember||item.participants?.includes(currentMember)),[state,currentMember])
  const capacity=useMemo(()=>schedule.reduce((sum,item)=>sum+Math.max(0,minutes(item.endTime)-minutes(item.startTime)),0),[schedule])

  const toggleParticipant=(form,setForm,member)=>setForm({...form,participants:form.participants.includes(member)?form.participants.filter(name=>name!==member):[...form.participants,member]})
  const saveBlock=event=>{event.preventDefault();if(!blockForm.title.trim())return;if(editingId){persist(updateScheduleBlock(state,editingId,{...blockForm,date},currentMember));setEditingId('')}else persist(createScheduleBlock(state,{...blockForm,date},currentMember));setBlockForm(emptyBlock(currentMember));setBlockForm(form=>({...form,date}));setShowAdd(false)}
  const editBlock=item=>{if(item.sourceType==='routine'){const choice=window.confirm('Change this occurrence only? Press OK for today only, Cancel to edit the recurring routine.');if(choice){const start=window.prompt('Start time (HH:MM)',item.startTime);if(!start)return;const end=window.prompt('End time (HH:MM)',item.endTime);if(!end)return;persist(overrideRoutineOccurrence(state,item.routineId,date,{startTime:start,endTime:end},currentMember));return}setEditingId(item.routineId);return}setEditingId(item.id);setBlockForm({...item,participants:item.participants||[]});setShowAdd(true)}
  const removeBlock=item=>{if(item.sourceType==='routine'){if(window.confirm('Skip this routine for today only?'))persist(overrideRoutineOccurrence(state,item.routineId,date,{cancelled:true},currentMember));return}if(window.confirm(`Remove “${item.title}” from ${date}?`))persist(deleteScheduleBlock(state,item.id))}
  const saveRoutine=event=>{event.preventDefault();if(!routineForm.title.trim()||!routineForm.days.length)return;if(editingId){persist(updateRoutine(state,editingId,routineForm,currentMember));setEditingId('')}else persist(createRoutine(state,routineForm,currentMember));setRoutineForm(emptyRoutine(currentMember));setShowAdd(false)}
  const editRoutine=item=>{setEditingId(item.id);setRoutineForm({...item,participants:item.participants||[],days:item.days||[]});setShowAdd(true)}

  if(mode==='routines')return <div className="household-schedule"><header className="schedule-hero"><div><p>Household Management · Routines</p><h1>Routines</h1><span>Define recurring rhythms once. Brevity places them into each member’s daily Schedule automatically.</span></div><button onClick={()=>{setShowAdd(v=>!v);setEditingId('');setRoutineForm(emptyRoutine(currentMember))}}><i className={`ti ${showAdd?'ti-x':'ti-plus'}`}/> {showAdd?'Close':'Add routine'}</button></header>
    {showAdd&&<form className="schedule-form" onSubmit={saveRoutine}><label className="wide"><span>Routine</span><input required value={routineForm.title} onChange={e=>setRoutineForm({...routineForm,title:e.target.value})} placeholder="Morning walk"/></label><label><span>Owner</span><select value={routineForm.owner} onChange={e=>setRoutineForm({...routineForm,owner:e.target.value})}>{HOUSEHOLD_MEMBERS.map(name=><option key={name}>{name}</option>)}</select></label><label><span>Pillar</span><select value={routineForm.pillar} onChange={e=>setRoutineForm({...routineForm,pillar:e.target.value})}>{PILLARS.map(name=><option key={name}>{name}</option>)}</select></label><label><span>Start</span><input type="time" value={routineForm.startTime} onChange={e=>setRoutineForm({...routineForm,startTime:e.target.value})}/></label><label><span>End</span><input type="time" value={routineForm.endTime} onChange={e=>setRoutineForm({...routineForm,endTime:e.target.value})}/></label><div className="wide schedule-choice-group"><span>Days</span><div>{WEEKDAYS.map((name,index)=><button type="button" className={routineForm.days.includes(index)?'active':''} onClick={()=>setRoutineForm({...routineForm,days:routineForm.days.includes(index)?routineForm.days.filter(day=>day!==index):[...routineForm.days,index]})} key={name}>{name.slice(0,3)}</button>)}</div></div><div className="wide schedule-choice-group"><span>Participants</span><div>{HOUSEHOLD_MEMBERS.filter(name=>name!==routineForm.owner).map(name=><button type="button" className={routineForm.participants.includes(name)?'active':''} onClick={()=>toggleParticipant(routineForm,setRoutineForm,name)} key={name}>{name}</button>)}</div></div><label className="wide"><span>Notes / standard</span><input value={routineForm.notes} onChange={e=>setRoutineForm({...routineForm,notes:e.target.value})}/></label><button className="wide schedule-save" type="submit">{editingId?'Update routine':'Save routine'}</button></form>}
    <div className="routine-list">{!memberRoutines.length&&<div className="schedule-empty">No routines are assigned to {currentMember} yet.</div>}{memberRoutines.map(item=><article key={item.id}><div><span>{item.pillar}</span><h3>{item.title}</h3><p>{item.days.map(day=>WEEKDAYS[day].slice(0,3)).join(' · ')} · {timeLabel(item.startTime)}–{timeLabel(item.endTime)}</p><small>{item.owner}{item.participants?.length?` · with ${item.participants.join(', ')}`:''}</small></div><div className="routine-actions"><button onClick={()=>persist(updateRoutine(state,item.id,{enabled:!item.enabled},currentMember))}>{item.enabled?'Pause':'Resume'}</button>{item.owner===currentMember&&<><button onClick={()=>editRoutine(item)}>Edit</button><button onClick={()=>window.confirm(`Delete “${item.title}”?`)&&persist(deleteRoutine(state,item.id))}>Delete</button></>}</div></article>)}</div>
  </div>

  return <div className="household-schedule"><header className="schedule-hero"><div><p>Household Management · Schedule</p><h1>My Schedule</h1><span>Time-block the day, accept household invitations, and see recurring routines in one hour-by-hour view.</span></div><button onClick={()=>{setShowAdd(v=>!v);setEditingId('');setBlockForm({...emptyBlock(currentMember),date})}}><i className={`ti ${showAdd?'ti-x':'ti-plus'}`}/> {showAdd?'Close':'Add time block'}</button></header>
    <section className="schedule-command"><label><span>Day</span><input type="date" value={date} onChange={e=>{setDate(e.target.value);setBlockForm(form=>({...form,date:e.target.value}))}}/></label><div><span>Scheduled</span><strong>{schedule.length} blocks</strong></div><div><span>Allocated</span><strong>{Math.round(capacity/60*10)/10} hrs</strong></div><div><span>Invitations</span><strong>{invites.length} pending</strong></div></section>
    {invites.length>0&&<section className="schedule-invitations"><header><div><p>Invitations</p><h2>Household invitations awaiting your response</h2></div></header>{invites.slice(0,5).map(item=><article key={item.id}><div><strong>{item.title}</strong><span>{item.date} · {timeLabel(item.startTime)}–{timeLabel(item.endTime)} · from {item.owner}</span></div><div><button onClick={()=>persist(respondToInvitation(state,item.id,currentMember,'accepted'))}>Accept</button><button onClick={()=>persist(respondToInvitation(state,item.id,currentMember,'declined'))}>Decline</button></div></article>)}</section>}
    {showAdd&&<form className="schedule-form" onSubmit={saveBlock}><label className="wide"><span>Time block</span><input required value={blockForm.title} onChange={e=>setBlockForm({...blockForm,title:e.target.value})} placeholder="Prepare lunch"/></label><label><span>Date</span><input type="date" value={blockForm.date} onChange={e=>setBlockForm({...blockForm,date:e.target.value})}/></label><label><span>Pillar</span><select value={blockForm.pillar} onChange={e=>setBlockForm({...blockForm,pillar:e.target.value})}>{PILLARS.map(name=><option key={name}>{name}</option>)}</select></label><label><span>Start</span><input type="time" value={blockForm.startTime} onChange={e=>setBlockForm({...blockForm,startTime:e.target.value})}/></label><label><span>End</span><input type="time" value={blockForm.endTime} onChange={e=>setBlockForm({...blockForm,endTime:e.target.value})}/></label><div className="wide schedule-choice-group"><span>Invite household members</span><div>{HOUSEHOLD_MEMBERS.filter(name=>name!==currentMember).map(name=><button type="button" className={blockForm.participants.includes(name)?'active':''} onClick={()=>toggleParticipant(blockForm,setBlockForm,name)} key={name}>{name}</button>)}</div></div><label className="wide"><span>Notes</span><input value={blockForm.notes} onChange={e=>setBlockForm({...blockForm,notes:e.target.value})}/></label><button className="wide schedule-save" type="submit">{editingId?'Update block':'Add to schedule'}</button></form>}
    <div className="schedule-day"><aside>{HOURS.map(hour=><div key={hour}><span>{hourLabel(hour)}</span></div>)}</aside><main>{HOURS.map(hour=><div className="schedule-hour-line" key={hour}/>)}{schedule.map(item=>{const start=minutes(item.startTime),end=minutes(item.endTime),top=Math.max(0,(start-300)/60*68),height=Math.max(38,(end-start)/60*68);return <article className={`schedule-block schedule-block--${item.sourceType}`} style={{top,height}} key={item.id}><div><span>{item.pillar}{item.sourceType==='routine'?' · Routine':''}</span><strong>{item.title}</strong><small>{timeLabel(item.startTime)}–{timeLabel(item.endTime)}{item.participants?.length?` · ${item.participants.join(', ')}`:''}</small></div><div><button onClick={()=>editBlock(item)}>Edit</button><button onClick={()=>removeBlock(item)}>×</button></div></article>})}{!schedule.length&&<div className="schedule-empty-overlay">No time blocks yet. Add a block or create a routine.</div>}</main></div>
  </div>
}
