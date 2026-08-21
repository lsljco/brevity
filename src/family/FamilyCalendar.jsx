import { useEffect, useMemo, useState } from 'react'
import { FAMILY_CALENDAR_KEY, HOUSEHOLD_MEMBERS, readJson } from '../homehq/projectData.js'
import { fetchICloudCalendarEvents } from './icloudCalendarApi.js'
import { ICLOUD_CACHE_KEY } from '../household/appRefresh.js'
import FinanceTimeframe from '../finance/FinanceTimeframe.jsx'
import { resolveTimeframe } from '../finance/financeTimeframe.js'
import './FamilyCalendar.css'

const gold = '#C5A46D'
const soft = 'rgba(247,243,234,.72)'
const muted = 'rgba(247,243,234,.42)'
const border = 'rgba(255,255,255,.08)'
const iso = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`

const normalizeLegacy = event => ({
  ...event,
  date: event.start,
  source: 'brevity-legacy',
  owner: event.owner || 'Family',
})

export default function FamilyCalendar({ currentMember = 'Family', includeFamily = false, title = 'Family Calendar', subtitle = 'Brevity is authoritative · Apple Calendar supplies native timed alerts' }){
  const today = new Date()
  const [month,setMonth]=useState(today.getMonth())
  const [year,setYear]=useState(today.getFullYear())
  const [member,setMember]=useState(currentMember || 'Family')
  const [range,setRange]=useState(()=>resolveTimeframe('this-month'))
  const [legacyEvents,setLegacyEvents]=useState(()=>readJson(localStorage,FAMILY_CALENDAR_KEY,[]).map(normalizeLegacy))
  const cachedCalendar=useMemo(()=>readJson(localStorage,ICLOUD_CACHE_KEY,null),[])
  const [icloudEvents,setIcloudEvents]=useState(()=>(cachedCalendar?.events||[]).map(event=>({ ...event,source:'icloud',owner:event.owner||'Family' })))
  const [icloudState,setIcloudState]=useState(cachedCalendar?'ready':'loading')
  const [calendarName,setCalendarName]=useState(cachedCalendar?.calendar||'Apple/iCloud Calendar')

  const loadIcloud = async () => {
    setIcloudState('loading')
    try {
      const result = await fetchICloudCalendarEvents()
      const events=(result.events || []).map(event => ({ ...event, source: 'icloud', owner: event.owner || 'Family' }))
      setIcloudEvents(events)
      setCalendarName(result.calendar || 'Apple/iCloud Calendar')
      try{localStorage.setItem(ICLOUD_CACHE_KEY,JSON.stringify(result))}catch{}
      setIcloudState('ready')
    } catch (error) {
      setIcloudState(error.status === 401 ? 'locked' : error.status === 503 ? 'unconfigured' : 'error')
    }
  }

  useEffect(()=>{
    if(!cachedCalendar)loadIcloud()
    const refresh=()=>setLegacyEvents(readJson(localStorage,FAMILY_CALENDAR_KEY,[]).map(normalizeLegacy))
    const receiveIcloud=event=>{
      const result=event.detail||{}
      setIcloudEvents((result.events||[]).map(item=>({ ...item,source:'icloud',owner:item.owner||'Family' })))
      setCalendarName(result.calendar||'Apple/iCloud Calendar')
      setIcloudState('ready')
    }
    window.addEventListener('storage',refresh)
    window.addEventListener('brevity-family-calendar-updated',refresh)
    window.addEventListener('brevity-icloud-calendar-refreshed',receiveIcloud)
    return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('brevity-family-calendar-updated',refresh);window.removeEventListener('brevity-icloud-calendar-refreshed',receiveIcloud)}
  },[])

  const allEvents=useMemo(()=>{
    const cloudSources=new Set(icloudEvents.map(event=>event.sourceId).filter(Boolean))
    return [...legacyEvents.filter(event=>!cloudSources.has(event.id)),...icloudEvents]
  },[legacyEvents,icloudEvents])
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
  const first=new Date(year,month,1).getDay()
  const days=new Date(year,month+1,0).getDate()
  const cells=[...Array(first).fill(null),...Array.from({length:days},(_,i)=>i+1)]
  while(cells.length%7)cells.push(null)
  const move=delta=>{const next=new Date(year,month+delta,1);setYear(next.getFullYear());setMonth(next.getMonth())}

  const stateCopy={
    loading:'Checking secure iCloud calendar…',
    ready:`Connected to ${calendarName}`,
    locked:'iCloud calendar is secure and currently locked on this device.',
    unconfigured:'iCloud calendar credentials are not configured in Brevity yet.',
    error:'iCloud calendar could not be reached. Brevity events remain available.',
  }

  return <div className="family-calendar" style={{minHeight:'100vh',background:'#000',padding:'28px 32px',color:soft,fontFamily:"'Inter',system-ui,sans-serif"}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:18,flexWrap:'wrap',marginBottom:18}}>
      <div><h1 className="family-calendar-title" style={{margin:0,fontFamily:"'Cormorant Garamond',serif",fontSize:30,fontWeight:500,color:'rgba(247,243,234,.92)'}}>{title}</h1><p className="family-calendar-subtitle" style={{margin:'5px 0 0',fontSize:12,color:muted}}>{subtitle}</p></div>
      <div className="family-calendar-filters" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {['Family',...HOUSEHOLD_MEMBERS].map(name=><button key={name} onClick={()=>setMember(name)} style={{padding:'7px 12px',borderRadius:20,border:`1px solid ${member===name?gold:border}`,background:member===name?'rgba(197,164,109,.16)':'rgba(255,255,255,.04)',color:member===name?gold:muted,cursor:'pointer',fontSize:12}}>{name==='Family'?'All / Family':name}</button>)}
      </div>
    </div>
    <div className="family-calendar-status" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:20,padding:'10px 12px',border:`1px solid ${border}`,borderRadius:10,background:'rgba(255,255,255,.025)'}}>
      <span style={{fontSize:10,color:icloudState==='ready'?gold:muted}}>{stateCopy[icloudState]}</span>
      <button onClick={loadIcloud} style={{border:`1px solid ${border}`,background:'rgba(255,255,255,.04)',color:soft,borderRadius:8,padding:'6px 10px',fontSize:10,cursor:'pointer'}}>Refresh</button>
    </div>
    <FinanceTimeframe value={range} onChange={next=>{setRange(next);const focus=new Date(`${next.from}T12:00:00`);if(!Number.isNaN(focus.getTime())){setYear(focus.getFullYear());setMonth(focus.getMonth())}}} label="Planner dates" />
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:18,marginBottom:18}}>
      <button aria-label="Previous month" onClick={()=>move(-1)} style={{background:'rgba(255,255,255,.05)',border:`1px solid ${border}`,color:soft,borderRadius:8,padding:'6px 12px',cursor:'pointer'}}>‹</button>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:23,color:'rgba(247,243,234,.92)',minWidth:170,textAlign:'center'}}>{new Date(year,month).toLocaleDateString('en-US',{month:'long',year:'numeric'})}</div>
      <button aria-label="Next month" onClick={()=>move(1)} style={{background:'rgba(255,255,255,.05)',border:`1px solid ${border}`,color:soft,borderRadius:8,padding:'6px 12px',cursor:'pointer'}}>›</button>
    </div>
    <div className="family-calendar-scroll"><div className="family-calendar-grid" style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3}}>
      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=><div className="family-calendar-weekday" key={day} style={{textAlign:'center',padding:8,fontSize:10,fontWeight:700,letterSpacing:1,color:muted,textTransform:'uppercase'}}>{day}</div>)}
      {cells.map((day,index)=>{
        if(!day)return <div key={index} style={{minHeight:108}}/>
        const key=iso(new Date(year,month,day)); const dayEvents=byDate[key]||[]; const isToday=key===iso(today)
        return <div className="family-calendar-day" key={key} style={{minHeight:108,padding:8,borderRadius:9,border:`1px solid ${isToday?'rgba(197,164,109,.48)':border}`,background:isToday?'rgba(197,164,109,.08)':'rgba(255,255,255,.035)'}}>
          <div className="family-calendar-day-number" style={{fontSize:12,fontWeight:700,color:isToday?gold:soft,marginBottom:6}}>{day}</div>
          {dayEvents.map(event=><div className="family-calendar-event" key={`${event.source}-${event.id}`} style={{borderLeft:`2px solid ${event.source==='icloud'?gold:'rgba(247,243,234,.28)'}`,background:event.source==='icloud'?'rgba(197,164,109,.10)':'rgba(255,255,255,.045)',borderRadius:'0 5px 5px 0',padding:'5px 6px',marginBottom:5}}>
            <div className="family-calendar-event-title" style={{fontSize:10,fontWeight:700,color:soft,lineHeight:1.3}}>{event.time?`${event.time} · `:''}{event.title}</div>
            <div className="family-calendar-event-meta" style={{fontSize:8,color:muted,marginTop:2,textTransform:'uppercase',letterSpacing:.6}}>{event.source==='icloud'?'Apple alert':event.source==='project'?'Project':'Brevity'}{event.owner&&event.owner!=='Family'?` · ${event.owner}`:''}</div>
          </div>)}
        </div>
      })}
    </div></div>
    {filtered.length===0&&<div style={{textAlign:'center',padding:'42px 20px',color:muted}}>No calendar commitments for this view. Add timed commitments in Morning Alignment and enable Calendar when an Apple alert is useful.</div>}
  </div>
}
