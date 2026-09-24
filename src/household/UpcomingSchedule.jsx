import { useMemo, useState } from 'react'
import { calendarAppointmentsForPlan } from '../family/calendarOverlay.js'
import { calendarSnapshotHealth } from '../family/calendarSnapshot.js'
import { buildHouseholdMaintenanceWeek, householdOccurrence, HOUSEHOLD_MAINTENANCE_STORAGE_KEY, normalizeHouseholdMaintenanceState, occurrenceStatus } from './householdMaintenanceData.js'
import { formatDailyPlanDate } from './alignmentDate.js'
import {scheduleDates} from './UpcomingScheduleDates.js'
import { useDailyPlan } from './useDailyPlan.js'
import './UpcomingSchedule.css'

const clock = item => {
  if(item.allDay)return 'All day'
  if(item.startTime)return item.startTime
  if(item.startsAt){const date=new Date(item.startsAt);if(!Number.isNaN(date.getTime()))return date.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
  return 'Time not set'
}

export default function UpcomingSchedule({ today, mealPlan, calendarData, onBack, onOpenCalendar, onOpenMealPlan }) {
  const dates=useMemo(()=>scheduleDates(today),[today])
  const [date,setDate]=useState(dates[1])
  const selectedDate=dates.includes(date)?date:dates[1]
  const {plan,state,error,reload}=useDailyPlan(selectedDate)
  const appointments=useMemo(()=>calendarAppointmentsForPlan(plan,calendarData?.events),[plan,calendarData?.events])
  const calendarHealth=useMemo(()=>calendarSnapshotHealth(calendarData),[calendarData])
  const meals=mealPlan.data?.days?.find(day=>day.date===selectedDate)?.resolvedMeals
  const chores=useMemo(()=>{
    let saved
    try { saved=JSON.parse(localStorage.getItem(HOUSEHOLD_MAINTENANCE_STORAGE_KEY)||'{}') } catch { saved={} }
    const maintenance=normalizeHouseholdMaintenanceState(saved)
    return (buildHouseholdMaintenanceWeek(selectedDate,maintenance).find(day=>day.date===selectedDate)?.tasks||[]).map(task=>({...task,status:occurrenceStatus(task,householdOccurrence(maintenance,task))}))
  },[selectedDate])
  const outcomes=plan.topPriorities?.length?plan.topPriorities:plan.household?.priorities||[]
  return <div className="household-today-workspace upcoming-schedule">
    <header className="upcoming-schedule-header"><div><span>Household Command Center</span><h1>Next 7 Days</h1><p>Review the shared plan, meals, chores, and read-only Family Calendar for each date.</p></div><button type="button" onClick={onBack}>Back to Today</button></header>
    <label className="upcoming-schedule-picker">Choose a day<select aria-label="Choose a day" value={selectedDate} onChange={event=>setDate(event.target.value)}>{dates.map((day,index)=><option key={day} value={day}>{index===0?'Today · ':index===1?'Tomorrow · ':''}{formatDailyPlanDate(day)}</option>)}</select></label>
    <h2>{formatDailyPlanDate(selectedDate)}</h2>
    {state==='loading'&&<p role="status">Loading this day’s shared plan…</p>}
    {state==='error'&&<div role="alert">{error}<button type="button" onClick={reload}>Retry</button></div>}
    {state==='ready'&&<div className="upcoming-schedule-grid">
      <section><h3>Focus &amp; outcomes</h3><p>{plan.household?.keyFocus||'No focus has been set for this day.'}</p>{outcomes.length>0&&<ol>{outcomes.slice(0,3).map((item,index)=><li key={item.id||index}>{typeof item==='string'?item:item.title}</li>)}</ol>}</section>
      <section><h3>Meals</h3>{mealPlan.state==='loading'?<p>Loading meals…</p>:meals?<ul>{['breakfast','lunch','dinner'].map(type=><li key={type}><strong>{type}</strong> · {meals[type]?.name||'Not planned'}</li>)}</ul>:<p>Meal plan unavailable for this day. <button type="button" onClick={onOpenMealPlan}>Open Meal Plan</button></p>}</section>
      <section><h3>Household chores · {chores.length}</h3>{chores.length?<ul>{chores.map(task=><li key={task.occurrenceId}><strong>{task.title}</strong> · {task.timing||'Flexible'} · {task.owners?.join(', ')||'Family'} · {task.status}</li>)}</ul>:<p>No chores scheduled for this day.</p>}</section>
      <section><h3>Appointments &amp; meetings · {appointments.length}</h3><p className="upcoming-schedule-note">{calendarHealth.usable?'Read-only Family Calendar projection.':'Calendar is not verified; refresh the Family Calendar before relying on this list.'}</p>{appointments.length?<ul>{appointments.map(item=><li key={item.id}><strong>{clock(item)} · {item.title}</strong> · {item.owner||'Family'} · {item.calendarSource==='icloud'?'Apple Family Calendar':'Brevity'}</li>)}</ul>:<p>No appointments visible for this day.</p>}<button type="button" onClick={onOpenCalendar}>Open Family Calendar</button></section>
    </div>}
  </div>
}
