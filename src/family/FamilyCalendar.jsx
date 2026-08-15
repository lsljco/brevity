import { useEffect, useMemo, useState } from 'react'
import { FAMILY_CALENDAR_KEY, HOUSEHOLD_MEMBERS, readJson } from '../homehq/projectData.js'

const gold = '#C5A46D'
const soft = 'rgba(247,243,234,.72)'
const muted = 'rgba(247,243,234,.42)'
const border = 'rgba(255,255,255,.08)'

const iso = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`

export default function FamilyCalendar(){
  const today = new Date()
  const [month,setMonth]=useState(today.getMonth())
  const [year,setYear]=useState(today.getFullYear())
  const [member,setMember]=useState('Family')
  const [events,setEvents]=useState(()=>readJson(localStorage,FAMILY_CALENDAR_KEY,[]))

  useEffect(()=>{
    const refresh=()=>setEvents(readJson(localStorage,FAMILY_CALENDAR_KEY,[]))
    window.addEventListener('storage',refresh)
    window.addEventListener('brevity-family-calendar-updated',refresh)
    return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('brevity-family-calendar-updated',refresh)}
  },[])

  const filtered=useMemo(()=>events.filter(event=>member==='Family'||event.members?.includes(member)||event.owner===member),[events,member])
  const byDate=useMemo(()=>{
    const map={}
    filtered.forEach(event=>{
      if(!event.start)return
      ;(map[event.start]??=[]).push(event)
    })
    return map
  },[filtered])
  const first=new Date(year,month,1).getDay()
  const days=new Date(year,month+1,0).getDate()
  const cells=[...Array(first).fill(null),...Array.from({length:days},(_,i)=>i+1)]
  while(cells.length%7)cells.push(null)
  const move=delta=>{const next=new Date(year,month+delta,1);setYear(next.getFullYear());setMonth(next.getMonth())}

  return <div style={{minHeight:'100vh',background:'#000',padding:'28px 32px',color:soft,fontFamily:"'Inter',system-ui,sans-serif"}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:18,flexWrap:'wrap',marginBottom:24}}>
      <div><h1 style={{margin:0,fontFamily:"'Cormorant Garamond',serif",fontSize:30,fontWeight:500,color:'rgba(247,243,234,.92)'}}>Family Calendar</h1><p style={{margin:'5px 0 0',fontSize:12,color:muted}}>Shared household events · project events publish here automatically</p></div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {['Family',...HOUSEHOLD_MEMBERS].map(name=><button key={name} onClick={()=>setMember(name)} style={{padding:'7px 12px',borderRadius:20,border:`1px solid ${member===name?gold:border}`,background:member===name?'rgba(197,164,109,.16)':'rgba(255,255,255,.04)',color:member===name?gold:muted,cursor:'pointer',fontSize:12}}>{name==='Family'?'All / Family':name}</button>)}
      </div>
    </div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:18,marginBottom:18}}>
      <button aria-label="Previous month" onClick={()=>move(-1)} style={{background:'rgba(255,255,255,.05)',border:`1px solid ${border}`,color:soft,borderRadius:8,padding:'6px 12px',cursor:'pointer'}}>‹</button>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:23,color:'rgba(247,243,234,.92)',minWidth:170,textAlign:'center'}}>{new Date(year,month).toLocaleDateString('en-US',{month:'long',year:'numeric'})}</div>
      <button aria-label="Next month" onClick={()=>move(1)} style={{background:'rgba(255,255,255,.05)',border:`1px solid ${border}`,color:soft,borderRadius:8,padding:'6px 12px',cursor:'pointer'}}>›</button>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3}}>
      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=><div key={day} style={{textAlign:'center',padding:8,fontSize:10,fontWeight:700,letterSpacing:1,color:muted,textTransform:'uppercase'}}>{day}</div>)}
      {cells.map((day,index)=>{
        if(!day)return <div key={index} style={{minHeight:108}}/>
        const key=iso(new Date(year,month,day)); const dayEvents=byDate[key]||[]; const isToday=key===iso(today)
        return <div key={key} style={{minHeight:108,padding:8,borderRadius:9,border:`1px solid ${isToday?'rgba(197,164,109,.48)':border}`,background:isToday?'rgba(197,164,109,.08)':'rgba(255,255,255,.035)'}}>
          <div style={{fontSize:12,fontWeight:700,color:isToday?gold:soft,marginBottom:6}}>{day}</div>
          {dayEvents.map(event=><div key={event.id} style={{borderLeft:`2px solid ${gold}`,background:'rgba(197,164,109,.10)',borderRadius:'0 5px 5px 0',padding:'5px 6px',marginBottom:5}} title={(event.members||['Family']).join(', ')}>
            <div style={{fontSize:10,fontWeight:700,color:soft,lineHeight:1.3}}>{event.title}</div>
            <div style={{fontSize:9,color:muted,marginTop:2}}>{(event.members||['Family']).join(', ')}</div>
          </div>)}
        </div>
      })}
    </div>
    {filtered.length===0&&<div style={{textAlign:'center',padding:'42px 20px',color:muted}}>No Family Calendar events yet. Open Projects, add dates, and choose “Push this project event to Family Calendar.”</div>}
  </div>
}
