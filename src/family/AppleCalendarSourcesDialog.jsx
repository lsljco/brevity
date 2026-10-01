import { useEffect, useState } from 'react'
import { fetchAppleCalendarSources } from './icloudCalendarApi.js'
import { APPLE_SOURCE_OWNERS } from './appleCalendarSources.js'
import { prepareDirectAction } from '../assistant/assistantApi.js'
import { requestActionReview } from '../assistant/actionEvents.js'

export default function AppleCalendarSourcesDialog({onClose}) {
  const [data,setData]=useState(null),[selected,setSelected]=useState([])
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{let active=true;fetchAppleCalendarSources().then(result=>{if(active){setData(result);setSelected(result.selected||[])}}).catch(cause=>{if(active)setError(cause.message)});return()=>{active=false}},[])
  const select=(calendar,owner)=>setSelected(current=>[...current.filter(row=>row.id!==calendar.id),...(owner?[{id:calendar.id,name:calendar.name,owner}]:[])])
  const review=async event=>{
    event.preventDefault();setBusy(true);setError('')
    try{
      const description=selected.length?selected.map(row=>`${row.name} → ${row.owner}`).join('; '):'Disconnect all additional calendars'
      const result=await prepareDirectAction({summary:'Update Apple calendar connections',expectedVersion:data.version,operation:{type:'apple.sources.update',targetId:'apple-sources',payload:{sources:selected},description:`${description}. Selected calendars become visible to the household. Family stays connected. Additional calendars are read-only; edit their events in Apple Calendar.`}})
      if(!result?.proposal?.id)throw new Error('Calendar source review could not be prepared.')
      onClose();requestActionReview(result.proposal)
    }catch(cause){setError(cause.message)}finally{setBusy(false)}
  }
  const calendars=data?[...data.calendars,...selected.filter(row=>!data.calendars.some(calendar=>calendar.id===row.id)).map(row=>({...row,missing:true}))]:[]
  return <div className="family-calendar-editor-backdrop"><section className="family-calendar-editor apple-calendar-sources" role="dialog" aria-modal="true" aria-labelledby="apple-sources-title">
    <header><h2 id="apple-sources-title">Apple calendar sources</h2><button type="button" onClick={onClose} aria-label="Close calendar sources">×</button></header>
    <p>Keep each person’s appointments in their own Apple calendar. Privately share those calendars with the Apple account connected to Brevity; they will appear here.</p>
    <p>Choose only calendars you want visible to the whole household. Assign the person explicitly. Family includes household calendars; All also includes Church Triumphant. Additional calendars are read-only here; edit events in Apple Calendar.</p>
    {!data&&!error&&<p role="status">Finding available Apple calendars…</p>}
    {error&&<p role="alert" className="family-calendar-editor-error">{error}</p>}
    {data&&<form id="apple-sources-form" onSubmit={review}><fieldset disabled={busy}><legend>Calendar assignments</legend>{calendars.map(calendar=><label key={calendar.id} style={{display:'grid',gap:8,marginBottom:16}}><span>{calendar.name}{calendar.primary?' · Shared Family calendar':calendar.missing?' · Unavailable in Apple':''}</span>{calendar.primary?<strong>Always connected · Existing event assignments retained</strong>:<select aria-label={`Assign ${calendar.name} (${calendar.id.slice(-8)})`} value={selected.find(row=>row.id===calendar.id)?.owner||''} onChange={event=>select(calendar,event.target.value)}><option value="">Not connected</option>{APPLE_SOURCE_OWNERS.map(owner=><option key={owner}>{owner}</option>)}</select>}<small>Calendar ID: {calendar.id.slice(-8)}</small></label>)}</fieldset><p>Review shows the exact mappings before saving. Removing a connection never deletes Apple events. Undo restores the previous mappings.</p></form>}
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" form="apple-sources-form" className="primary" disabled={!data||busy}>{busy?'Preparing review…':'Review connections'}</button></footer>
  </section></div>
}
