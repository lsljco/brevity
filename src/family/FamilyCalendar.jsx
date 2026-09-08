import { useEffect, useMemo, useState } from 'react'
import { FAMILY_CALENDAR_KEY, HOUSEHOLD_MEMBERS, readJson } from '../homehq/projectData.js'
import { fetchICloudCalendarEvents } from './icloudCalendarApi.js'
import { calendarSnapshotHealth, stampCalendarFailure, stampCalendarSuccess } from './calendarSnapshot.js'
import { dedupeCalendarEvents } from './calendarOverlay.js'
import {
  canEditBrevityCalendarEvent,
  calendarEventVersion,
  calendarPermissionForActionMode,
  calendarTimeInputValue,
  canonicalizeBrevityCalendarEvent,
  isBrevityManagedAppleEvent,
} from './calendarRecords.js'
import { ICLOUD_CACHE_KEY } from '../household/appRefresh.js'
import { SHARED_STATE_EVENT } from '../household/sharedState.js'
import { executeAssistantProposal, getActionMode, prepareCalendarAction } from '../assistant/assistantApi.js'
import FinanceTimeframe from '../finance/FinanceTimeframe.jsx'
import { getHouseholdCalendarDate, getHouseholdDateKey } from '../finance/financeTime.js'
import { resolveTimeframe } from '../finance/financeTimeframe.js'
import { FINANCE_MEETINGS_KEY, isLegacyMeetingCalendarCopy, meetingActionsCalendarEvents } from '../finance/meetingCalendar.js'
import {
  HOUSEHOLD_SCHEDULE_STORAGE_KEY, householdScheduleCalendarEvents,
  isHouseholdScheduleCalendarCopy, normalizeHouseholdScheduleState,
} from '../household/householdScheduleData.js'
import {
  HOUSEHOLD_MAINTENANCE_STORAGE_KEY, householdOperationCalendarEvents,
  isHouseholdOperationCalendarCopy, normalizeHouseholdMaintenanceState,
} from '../household/householdMaintenanceData.js'
import './FamilyCalendar.css'
import './FamilyCalendarViews.css'

const gold = '#C5A46D'
const soft = 'rgba(247,243,234,.72)'
const muted = 'rgba(247,243,234,.42)'
const border = 'rgba(255,255,255,.08)'
const iso = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
const calendarRange = range => {
  if (range?.preset !== 'this-month') return range
  const start = new Date(`${range.from}T12:00:00`)
  return { ...range, to: iso(new Date(start.getFullYear(), start.getMonth() + 1, 0)) }
}

const normalizeLegacy = event => {
  const normalized=canonicalizeBrevityCalendarEvent(event)
  return { ...normalized,date:normalized.date||normalized.start,source:normalized.source||'brevity-legacy',owner:normalized.owner||'Family' }
}
const readLegacyEvents=()=>readJson(localStorage,FAMILY_CALENDAR_KEY,[]).filter(event=>!isLegacyMeetingCalendarCopy(event)&&!isHouseholdScheduleCalendarCopy(event)&&!isHouseholdOperationCalendarCopy(event)).map(normalizeLegacy)
const readMeetingEvents=()=>meetingActionsCalendarEvents(localStorage).map(normalizeLegacy)
const readScheduleState=()=>normalizeHouseholdScheduleState(readJson(localStorage,HOUSEHOLD_SCHEDULE_STORAGE_KEY,{}))
const readMaintenanceState=()=>normalizeHouseholdMaintenanceState(readJson(localStorage,HOUSEHOLD_MAINTENANCE_STORAGE_KEY,{}))
const normalizeIcloud = event => {
  const owned=isBrevityManagedAppleEvent({ ...event,source:'icloud' })
  const normalized=owned?canonicalizeBrevityCalendarEvent({ ...event,source:'brevity-owned',calendarSource:'brevity' }):event
  return { ...normalized,source:'icloud',owner:normalized.owner||'Family' }
}
const eventToken = calendarEventVersion

const emptyForm = (date = getHouseholdDateKey(), owner = 'Family') => ({ title:'', date, time:'', owner, participants:[], notes:'' })
const eventForm = event => ({
  title:event?.title || '',
  date:event?.date || event?.start || getHouseholdDateKey(),
  time:calendarTimeInputValue(event?.time),
  owner:event?.owner || 'Family',
  participants:Array.isArray(event?.participants) ? event.participants : [],
  notes:event?.notes || '',
})

function CalendarEditor({ editor, ownerOptions, onChange, onReview, onCancel, onApply, busy, error }) {
  const review = editor.step === 'review'
  const form = editor.form
  const toggleParticipant = name => onChange({ ...form, participants:form.participants.includes(name) ? form.participants.filter(item => item !== name) : [...form.participants, name] })
  return <div className="family-calendar-editor-backdrop" role="presentation" onMouseDown={event=>event.target===event.currentTarget&&onCancel()}>
    <section className="family-calendar-editor" role="dialog" aria-modal="true" aria-labelledby="family-calendar-editor-title">
      <header><div><span>{review?'Review required':editor.mode==='create'?'New Brevity event':'Edit Brevity event'}</span><h2 id="family-calendar-editor-title">{review?'Confirm the calendar change':editor.mode==='create'?'Add to Family Calendar':'Update Family Calendar'}</h2></div><button type="button" onClick={onCancel} aria-label="Close calendar editor"><i className="ti ti-x" aria-hidden="true"/></button></header>
      {review ? <div className="family-calendar-review">
        <p>No record changes until you apply this reviewed proposal.</p>
        <dl><div><dt>Event</dt><dd>{form.title}</dd></div><div><dt>Date</dt><dd>{new Date(`${form.date}T12:00:00`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</dd></div><div><dt>Time</dt><dd>{form.time || 'All day'}</dd></div><div><dt>Owner</dt><dd>{form.owner}</dd></div>{form.participants.length>0&&<div><dt>Participants</dt><dd>{form.participants.join(', ')}</dd></div>}{form.notes.trim()&&<div><dt>Notes</dt><dd>{form.notes}</dd></div>}</dl>
        <div className="family-calendar-safety"><i className="ti ti-shield-check" aria-hidden="true"/><span>Action Mode will record the actor, timestamp, affected record, and prior values for Undo. The save stops if the Apple record changed after review.</span></div>
      </div> : <form id="family-calendar-record-form" onSubmit={onReview}>
        <label>Title<input required value={form.title} onChange={event=>onChange({...form,title:event.target.value})} placeholder="What is happening?"/></label>
        <div className="family-calendar-editor-grid"><label>Date<input required type="date" value={form.date} onChange={event=>onChange({...form,date:event.target.value})}/></label><label>Time, optional<input type="time" value={form.time} onChange={event=>onChange({...form,time:event.target.value})}/></label></div>
        <label>Owner<select value={form.owner} onChange={event=>onChange({...form,owner:event.target.value})}>{ownerOptions.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
        <fieldset><legend>Participants, optional</legend><div>{HOUSEHOLD_MEMBERS.map(name=><label key={name}><input type="checkbox" checked={form.participants.includes(name)} onChange={()=>toggleParticipant(name)}/><span>{name}</span></label>)}</div></fieldset>
        <label>Notes, optional<textarea rows="3" value={form.notes} onChange={event=>onChange({...form,notes:event.target.value})}/></label>
      </form>}
      {error&&<div className="family-calendar-editor-error" role="alert">{error}</div>}
      <footer>{review?<><button type="button" onClick={()=>onChange(form,'edit')} disabled={busy}>Back to edit</button><button type="button" className="primary" onClick={onApply} disabled={busy}>{busy?'Applying…':'Apply reviewed change'}</button></>:<><button type="button" onClick={onCancel}>Cancel</button><button type="submit" form="family-calendar-record-form" className="primary" disabled={busy}>{busy?'Preparing review…':'Review change'}</button></>}</footer>
    </section>
  </div>
}

export default function FamilyCalendar({ currentMember = 'Family', includeFamily = false, lockMember = false, title = 'Family Calendar', subtitle = 'Shared Apple events and Brevity-managed commitments from their authoritative records' }){
  const today = getHouseholdCalendarDate()
  const todayKey = getHouseholdDateKey()
  const [month,setMonth]=useState(today.getMonth())
  const [year,setYear]=useState(today.getFullYear())
  const [member,setMember]=useState(currentMember || 'Family')
  const [range,setRange]=useState(()=>calendarRange(resolveTimeframe('this-month')))
  const [viewMode,setViewMode]=useState('month')
  const [legacyEvents,setLegacyEvents]=useState(readLegacyEvents)
  const [meetingEvents,setMeetingEvents]=useState(readMeetingEvents)
  const [scheduleState,setScheduleState]=useState(readScheduleState)
  const [maintenanceState,setMaintenanceState]=useState(readMaintenanceState)
  const cachedCalendar=useMemo(()=>readJson(localStorage,ICLOUD_CACHE_KEY,null),[])
  const [icloudEvents,setIcloudEvents]=useState(()=>(cachedCalendar?.events||[]).map(normalizeIcloud))
  const [calendarHealth,setCalendarHealth]=useState(()=>calendarSnapshotHealth(cachedCalendar))
  const [icloudState,setIcloudState]=useState(()=>calendarSnapshotHealth(cachedCalendar).state)
  const [icloudError,setIcloudError]=useState(cachedCalendar?.error||'')
  const [calendarName,setCalendarName]=useState(cachedCalendar?.calendar||'Apple/iCloud Calendar')
  const [calendarAccess,setCalendarAccess]=useState({ state:'loading', allowed:false, member:'', role:'', reason:'Verifying Family Calendar permissions…' })
  const [editor,setEditor]=useState(null)
  const [editorBusy,setEditorBusy]=useState(false)
  const [editorError,setEditorError]=useState('')
  const [feedback,setFeedback]=useState('')

  const openCreate = () => {
    setEditorError('')
    setEditor({ mode:'create', step:'edit', form:emptyForm(todayKey,calendarAccess.member || 'Family'), record:null, expectedEventToken:'', proposal:null })
  }
  const openEdit = event => {
    if (!canEditBrevityCalendarEvent(event,calendarAccess)) return
    setEditorError('')
    setEditor({ mode:'edit', step:'edit', form:eventForm(event), record:event, expectedEventToken:eventToken(event), proposal:null })
  }
  const updateEditor = (form, step) => setEditor(value=>value ? { ...value, form, ...(step ? { step } : {}) } : value)
  const reviewEditor = async event => {
    event.preventDefault()
    const canonical = eventForm(canonicalizeBrevityCalendarEvent(editor.form))
    if (!canonical.title || !canonical.date) {
      setEditorError('A title and date are required.')
      return
    }
    setEditorBusy(true)
    setEditorError('')
    try {
      const type=editor.mode==='create'?'calendar.create':'calendar.update'
      const operation={
        type,
        description:`${editor.mode==='create'?'Create':'Update'} “${canonical.title}” on the Family Calendar`,
        targetId:editor.mode==='edit'?(editor.record.id||editor.record.uid||editor.record.sourceId):'',
        targetDate:canonical.date,
        payload:{...canonical,allDay:!canonical.time},
        allowedScopes:['this-item'],
        defaultScope:'this-item',
      }
      const result=await prepareCalendarAction({
        summary:`${editor.mode==='create'?'Add':'Edit'} Family Calendar event: ${canonical.title}`,
        operation,
        expectedEventToken:editor.expectedEventToken,
      })
      setEditor(value=>({ ...value,form:canonical,proposal:result.proposal,step:'review' }))
    } catch (error) {
      setEditorError(error.message||'Action Mode could not prepare this calendar change for review.')
    } finally {
      setEditorBusy(false)
    }
  }
  const applyEditor = async () => {
    setEditorBusy(true)
    setEditorError('')
    try {
      if(!editor.proposal?.id)throw new Error('This calendar proposal is no longer available. Return to edit and review it again.')
      const result=await executeAssistantProposal({proposalId:editor.proposal.id,selections:{},confirmed:true,confirmation:''})
      await loadIcloud()
      setFeedback(`${result.audit.summary}. Open Ask Brevity → Action Mode → Audit history to review or safely Undo it.`)
      setEditor(null)
    } catch (error) {
      setEditorError(error.message || 'Action Mode could not apply the Family Calendar change.')
    } finally {
      setEditorBusy(false)
    }
  }

  const loadIcloud = async () => {
    setIcloudState('loading')
    setIcloudError('')
    try {
      const result = await fetchICloudCalendarEvents()
      const snapshot=stampCalendarSuccess(result)
      setIcloudEvents((snapshot.events || []).map(normalizeIcloud))
      setCalendarName(snapshot.calendar || 'Apple/iCloud Calendar')
      try{localStorage.setItem(ICLOUD_CACHE_KEY,JSON.stringify(snapshot))}catch{}
      const health=calendarSnapshotHealth(snapshot)
      setCalendarHealth(health)
      setIcloudState(health.state)
    } catch (error) {
      const previous=readJson(localStorage,ICLOUD_CACHE_KEY,cachedCalendar||{})
      const snapshot=stampCalendarFailure(previous,error)
      try{localStorage.setItem(ICLOUD_CACHE_KEY,JSON.stringify(snapshot))}catch{}
      setIcloudEvents((snapshot.events||[]).map(normalizeIcloud))
      setIcloudError(snapshot.error)
      const health=calendarSnapshotHealth(snapshot)
      setCalendarHealth(health)
      setIcloudState(health.state)
    }
  }

  useEffect(()=>{
    let active=true
    getActionMode()
      .then(result=>{if(active)setCalendarAccess({state:'ready',role:result.role,...calendarPermissionForActionMode(result)})})
      .catch(error=>{if(active)setCalendarAccess({state:'error',allowed:false,member:'',reason:error.message||'Family Calendar permissions could not be verified.'})})
    if(!cachedCalendar||calendarSnapshotHealth(cachedCalendar).stale)loadIcloud()
    const refresh=event=>{
      const keys=event.detail?.keys||[]
      const derivedKeys=[FAMILY_CALENDAR_KEY,FINANCE_MEETINGS_KEY,HOUSEHOLD_SCHEDULE_STORAGE_KEY,HOUSEHOLD_MAINTENANCE_STORAGE_KEY]
      if(event.type===SHARED_STATE_EVENT&&!derivedKeys.some(key=>keys.includes(key)))return
      if(event.type==='storage'&&event.key&&!derivedKeys.includes(event.key))return
      setLegacyEvents(readLegacyEvents())
      setMeetingEvents(readMeetingEvents())
      setScheduleState(readScheduleState())
      setMaintenanceState(readMaintenanceState())
    }
    const receiveIcloud=event=>{
      const result=event.detail||{}
      setIcloudEvents((result.events||[]).map(normalizeIcloud))
      setCalendarName(result.calendar||'Apple/iCloud Calendar')
      setIcloudError(result.error||'')
      const health=calendarSnapshotHealth(result)
      setCalendarHealth(health)
      setIcloudState(health.state)
    }
    window.addEventListener('storage',refresh)
    window.addEventListener('brevity-family-calendar-updated',refresh)
    window.addEventListener(SHARED_STATE_EVENT,refresh)
    window.addEventListener('brevity-icloud-calendar-refreshed',receiveIcloud)
    return()=>{active=false;window.removeEventListener('storage',refresh);window.removeEventListener('brevity-family-calendar-updated',refresh);window.removeEventListener(SHARED_STATE_EVENT,refresh);window.removeEventListener('brevity-icloud-calendar-refreshed',receiveIcloud)}
  },[])

  const householdDerivedEvents=useMemo(()=>{
    const from=new Date(`${range.from}T12:00:00`),to=new Date(`${range.to}T12:00:00`)
    const span=Math.max(1,Math.ceil((to-from)/86400000)+1)
    return [
      ...householdScheduleCalendarEvents(scheduleState,{start:range.from,days:span}),
      ...householdOperationCalendarEvents(maintenanceState,{start:from,weeks:Math.ceil((span+7)/7)}),
    ].map(normalizeLegacy)
  },[scheduleState,maintenanceState,range])
  const allEvents=useMemo(()=>{
    const cloudSources=new Set(icloudEvents.map(event=>event.sourceId).filter(Boolean))
    return dedupeCalendarEvents([...legacyEvents.filter(event=>!cloudSources.has(event.id)),...meetingEvents,...householdDerivedEvents,...icloudEvents])
  },[legacyEvents,meetingEvents,householdDerivedEvents,icloudEvents])
  const filtered=useMemo(()=>allEvents.filter(event=>{
    const eventDate=event.date||event.start
    const sharedFamilyEvent=includeFamily&&(event.owner||'Family')==='Family'
    const memberMatches=member==='Family'||sharedFamilyEvent||event.members?.includes(member)||event.participants?.includes(member)||event.owner===member
    return memberMatches&&eventDate>=range.from&&eventDate<=range.to
  }),[allEvents,member,range])
  const byDate=useMemo(()=>{
    const map={}
    filtered.forEach(event=>{
      const key=event.date||event.start
      if(!key)return
      ;(map[key]??=[]).push(event)
    })
    Object.values(map).forEach(items=>items.sort((a,b)=>(a.time||'').localeCompare(b.time||'')))
    return map
  },[filtered])
  const agendaDays=useMemo(()=>Object.entries(byDate).sort(([left],[right])=>left.localeCompare(right)),[byDate])
  const upcomingAgendaDays=useMemo(()=>{
    const upcoming=agendaDays.filter(([date])=>date>=todayKey)
    return (upcoming.length?upcoming:agendaDays).slice(0,14)
  },[agendaDays,todayKey])
  const first=new Date(year,month,1).getDay()
  const days=new Date(year,month+1,0).getDate()
  const cells=[...Array(first).fill(null),...Array.from({length:days},(_,i)=>i+1)]
  while(cells.length%7)cells.push(null)
  const move=delta=>{const next=new Date(year,month+delta,1);setYear(next.getFullYear());setMonth(next.getMonth())}

  const stateCopy={
    loading:'Checking secure iCloud calendar…',
    ready:`Connected to ${calendarName}. ${calendarHealth.message}`,
    stale:calendarHealth.message,
    locked:calendarHealth.message || 'iCloud calendar is secure and currently locked.',
    unconfigured:calendarHealth.message || 'iCloud calendar credentials are not configured in Brevity yet.',
    error:calendarHealth.message || icloudError || 'iCloud calendar could not be reached. Cached Brevity events remain available.',
  }

  return <div className="family-calendar" style={{minHeight:'100vh',background:'#000',padding:'28px 32px',color:soft,fontFamily:"'Inter',system-ui,sans-serif"}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:18,flexWrap:'wrap',marginBottom:18}}>
      <div><h1 className="family-calendar-title" style={{margin:0,fontFamily:"'Cormorant Garamond',serif",fontSize:30,fontWeight:500,color:'rgba(247,243,234,.92)'}}>{title}</h1><p className="family-calendar-subtitle" style={{margin:'5px 0 0',fontSize:12,color:muted}}>{subtitle}</p>{calendarAccess.state!=='loading'&&!calendarAccess.allowed&&<p className="family-calendar-permission-note"><i className="ti ti-lock" aria-hidden="true"/> {calendarAccess.reason}</p>}</div>
      <div className="family-calendar-header-actions">{calendarAccess.allowed&&<button type="button" className="family-calendar-add" onClick={openCreate}><i className="ti ti-plus" aria-hidden="true"/> Add event</button>}{!lockMember&&<div className="family-calendar-filters" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {['Family',...HOUSEHOLD_MEMBERS].map(name=><button key={name} onClick={()=>setMember(name)} style={{padding:'7px 12px',borderRadius:20,border:`1px solid ${member===name?gold:border}`,background:member===name?'rgba(197,164,109,.16)':'rgba(255,255,255,.04)',color:member===name?gold:muted,cursor:'pointer',fontSize:12}}>{name==='Family'?'All / Family':name}</button>)}
      </div>}</div>
    </div>
    {feedback&&<div className="family-calendar-feedback" role="status"><span>{feedback}</span><button type="button" onClick={()=>setFeedback('')} aria-label="Dismiss calendar message"><i className="ti ti-x" aria-hidden="true"/></button></div>}
    <div className="family-calendar-status" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:20,padding:'10px 12px',border:`1px solid ${border}`,borderRadius:10,background:'rgba(255,255,255,.025)'}}>
      <span style={{fontSize:10,color:icloudState==='ready'?gold:icloudState==='loading'?muted:'#d8a16f'}}>{stateCopy[icloudState]}</span>
      <button onClick={loadIcloud} style={{border:`1px solid ${border}`,background:'rgba(255,255,255,.04)',color:soft,borderRadius:8,padding:'6px 10px',fontSize:10,cursor:'pointer'}}>Sync Family Calendar</button>
    </div>
    <FinanceTimeframe value={range} onChange={next=>{const calendarDates=calendarRange(next);setRange(calendarDates);const focus=new Date(`${calendarDates.from}T12:00:00`);if(!Number.isNaN(focus.getTime())){setYear(focus.getFullYear());setMonth(focus.getMonth())}}} label="Planner dates" selectLabel="Select calendar timeframe" />
    <div className="family-calendar-view-toggle" aria-label="Calendar view">
      <div><strong>Choose the useful view</strong><span>Agenda surfaces the next commitments; month shows spacing and conflicts.</span></div>
      <div><button type="button" className={viewMode==='agenda'?'active':''} onClick={()=>setViewMode('agenda')}>Agenda</button><button type="button" className={viewMode==='month'?'active':''} onClick={()=>setViewMode('month')}>Month</button></div>
    </div>
    <div className="family-calendar-month-navigation" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:18,marginBottom:18}}>
      <button aria-label="Previous month" onClick={()=>move(-1)} style={{background:'rgba(255,255,255,.05)',border:`1px solid ${border}`,color:soft,borderRadius:8,padding:'6px 12px',cursor:'pointer'}}>‹</button>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:23,color:'rgba(247,243,234,.92)',minWidth:170,textAlign:'center'}}>{new Date(year,month).toLocaleDateString('en-US',{month:'long',year:'numeric'})}</div>
      <button aria-label="Next month" onClick={()=>move(1)} style={{background:'rgba(255,255,255,.05)',border:`1px solid ${border}`,color:soft,borderRadius:8,padding:'6px 12px',cursor:'pointer'}}>›</button>
    </div>
    <div className={`family-calendar-scroll${viewMode==='month'?'':' is-hidden'}`}><div className="family-calendar-grid" style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3}}>
      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=><div className="family-calendar-weekday" key={day} style={{textAlign:'center',padding:8,fontSize:10,fontWeight:700,letterSpacing:1,color:muted,textTransform:'uppercase'}}>{day}</div>)}
      {cells.map((day,index)=>{
        if(!day)return <div key={index} style={{minHeight:108}}/>
        const key=iso(new Date(year,month,day)); const dayEvents=byDate[key]||[]; const isToday=key===todayKey
        return <div className="family-calendar-day" key={key} style={{minHeight:108,padding:8,borderRadius:9,border:`1px solid ${isToday?'rgba(197,164,109,.48)':border}`,background:isToday?'rgba(197,164,109,.08)':'rgba(255,255,255,.035)'}}>
          <div className="family-calendar-day-number" style={{fontSize:12,fontWeight:700,color:isToday?gold:soft,marginBottom:6}}>{day}</div>
          {dayEvents.map(event=><div className="family-calendar-event" key={`${event.source}-${event.id}`} style={{borderLeft:`2px solid ${event.source==='icloud'?gold:'rgba(247,243,234,.28)'}`,background:event.source==='icloud'?'rgba(197,164,109,.10)':'rgba(255,255,255,.045)',borderRadius:'0 5px 5px 0',padding:'5px 6px',marginBottom:5}}>
            <div className="family-calendar-event-title-row"><div className="family-calendar-event-title" style={{fontSize:10,fontWeight:700,color:soft,lineHeight:1.3}}>{event.time?`${event.time} · `:''}{event.title}</div>{canEditBrevityCalendarEvent(event,calendarAccess)&&<button type="button" onClick={()=>openEdit(event)} aria-label={`Edit ${event.title}`}><i className="ti ti-edit" aria-hidden="true"/></button>}</div>
            <div className="family-calendar-event-meta" style={{fontSize:8,color:muted,marginTop:2,textTransform:'uppercase',letterSpacing:.6}}>{isBrevityManagedAppleEvent(event)?'Brevity · Apple synced':event.source==='icloud'?'Apple Family Calendar · Read-only':'Brevity · Managed in source workflow'}{event.owner&&event.owner!=='Family'?` · ${event.owner}`:''}</div>
          </div>)}
        </div>
      })}
    </div></div>
    <div className={`family-calendar-mobile-agenda${viewMode==='agenda'?' is-selected':''}`}>
      {upcomingAgendaDays.map(([date,events])=><section key={date} className="family-calendar-agenda-day">
        <header><strong>{new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</strong><span>{events.length} {events.length===1?'commitment':'commitments'}</span></header>
        {events.map(event=><article key={`${event.source}-${event.id}`}>
          <time>{event.time||'All day'}</time>
          <div><strong>{event.title}</strong><span>{isBrevityManagedAppleEvent(event)?'Brevity · Apple synced':event.source==='icloud'?'Apple Family Calendar · Read-only':'Brevity · Managed in source workflow'}{event.owner&&event.owner!=='Family'?` · ${event.owner}`:''}</span></div>
          {canEditBrevityCalendarEvent(event,calendarAccess)&&<button type="button" className="family-calendar-agenda-edit" onClick={()=>openEdit(event)}><i className="ti ti-edit" aria-hidden="true"/> Edit</button>}
        </article>)}
      </section>)}
    </div>
    {filtered.length===0&&<div className="family-calendar-empty" style={{textAlign:'center',padding:'42px 20px',color:muted}}>
      <p>{icloudState==='error'||icloudState==='locked'||icloudState==='unconfigured'?'Apple events cannot appear until the Family Calendar connection above is restored. You can still add a Brevity calendar event now.':'No calendar commitments for this view yet.'}</p>
      {calendarAccess.allowed&&<button type="button" className="family-calendar-add" onClick={openCreate}><i className="ti ti-plus" aria-hidden="true"/> Add an event</button>}
    </div>}
    {editor&&<CalendarEditor editor={editor} ownerOptions={calendarAccess.role==='admin'?['Family',...HOUSEHOLD_MEMBERS]:[...new Set(['Family',calendarAccess.member,editor.form.owner].filter(Boolean))]} onChange={updateEditor} onReview={reviewEditor} onCancel={()=>setEditor(null)} onApply={applyEditor} busy={editorBusy} error={editorError}/>}
  </div>
}
