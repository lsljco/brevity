import {useEffect,useRef,useState} from 'react'
import ExecutiveCycles from './ExecutiveCycles.jsx'
import {EXECUTIVE_ROLES,HANDOFF_STATES,EXECUTIVE_NOTICE} from './model.js'
const endpoint='/.netlify/functions/executive-workspace'
async function request(query='',body){const response=await fetch(endpoint+query,{credentials:'include',cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json','x-brevity-executive':'1'},body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error||'Executive workspace unavailable.');return data}
function SavedInformation({value}){
 if(value===null||value===undefined)return <p>Not available</p>
 if(typeof value!=='object')return <p>{String(value)}</p>
 if(Array.isArray(value))return value.length?<ul>{value.map((item,index)=><li key={index}><SavedInformation value={item}/></li>)}</ul>:<p>No saved items in this snapshot</p>
 const label=key=>key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,letter=>letter.toUpperCase())
 return <dl>{Object.entries(value).filter(([key])=>key!=='versions').map(([key,item])=><div key={key}><dt>{label(key)}</dt><dd><SavedInformation value={item}/></dd></div>)}</dl>
}
export default function ExecutiveWorkspace({currentMember,readOnly=false}){
 const [role,setRole]=useState('bruce'),[data,setData]=useState(null),[context,setContext]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0)
 const [draft,setDraft]=useState({title:'',to:'coo',sourceRef:'',sourceAsOf:'unknown',note:'',due:''}),[notes,setNotes]=useState({})
 const generation=useRef(0),requestId=useRef(null)
 useEffect(()=>{let alive=true;generation.current++;setData(null);setContext(null);setError('');setNotes({});requestId.current=null;request('?role='+role).then(value=>{if(alive)setData(value)}).catch(failure=>{if(alive)setError(failure.message)});return()=>{alive=false;generation.current++}},[role,currentMember,revision])
 async function readContext(){const ticket=generation.current;setBusy(true);setError('');try{const value=await request('?view=context&role='+role);if(ticket===generation.current)setContext(value)}catch(failure){if(ticket===generation.current)setError(failure.message)}finally{setBusy(false)}}
 async function save(body){const ticket=generation.current;setBusy(true);setError('');try{await request('',{...body,member:currentMember,role});if(ticket===generation.current){if(body.action==='create'){setDraft({...draft,title:'',note:'',sourceRef:''});requestId.current=null}setRevision(n=>n+1)}}catch(failure){if(ticket===generation.current)setError(failure.message)}finally{setBusy(false)}}
 const field=(name,value)=>{requestId.current=null;setDraft({...draft,[name]:value})}
 return <details className="executive-workspace"><summary>My Agent Corporation</summary>
  <p>{EXECUTIVE_NOTICE}</p><p>The manual handoff register does not execute work. Use Executive coordination cycles for the bounded CFO-to-Bruce workflow.</p>
  <ExecutiveCycles currentMember={currentMember} readOnly={readOnly}/>
  <label>Operating role<select aria-label="Operating role" value={role} disabled={busy} onChange={e=>setRole(e.target.value)}>{EXECUTIVE_ROLES.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
  <p>{EXECUTIVE_ROLES.find(item=>item.id===role)?.owns}</p><p>Proposed cadence: {EXECUTIVE_ROLES.find(item=>item.id===role)?.cadence}. This is not a configured schedule.</p>
  <button disabled={busy} onClick={readContext}>Read this role’s saved information</button><button disabled={busy} onClick={()=>setRevision(n=>n+1)}>Refresh handoffs</button>
  {context&&<details open><summary>Saved information · {context.householdDate}</summary><p>{context.notice}</p><ul>{context.sources?.map(source=><li key={source.id}>{source.label}: {source.state} · Source updated: {source.asOf||'unknown'}</li>)}</ul><div style={{maxHeight:360,overflow:'auto'}}><SavedInformation value={context.data}/></div></details>}
  {error&&<p role="alert">{error}</p>}
  {!data&&!error&&<p role="status">Loading executive handoffs…</p>}
  {data&&<><p>{data.notice}</p>{data.hasMore&&<p role="alert">This is a partial queue. Additional stored handoffs are outside this view.</p>}
  <form onSubmit={e=>{e.preventDefault();requestId.current ||= crypto.randomUUID();save({action:'create',id:requestId.current,...draft})}}>
   <h3>Prepare an executive handoff</h3>
   <label>Receiving role<select value={draft.to} onChange={e=>field('to',e.target.value)}>{EXECUTIVE_ROLES.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
   <label>Required outcome<input required maxLength={180} value={draft.title} onChange={e=>field('title',e.target.value)}/></label>
   <label>Source record or evidence reference<input required maxLength={500} value={draft.sourceRef} onChange={e=>field('sourceRef',e.target.value)}/></label>
   <label>Source timestamp or “unknown”<input required maxLength={80} value={draft.sourceAsOf} onChange={e=>field('sourceAsOf',e.target.value)}/></label>
   <label>Due date, if agreed<input type="date" value={draft.due} onChange={e=>field('due',e.target.value)}/></label>
   <label>Requested work<textarea required maxLength={2000} value={draft.note} onChange={e=>field('note',e.target.value)}/></label>
   <p>Saving queues preparation only. Source changes still use their existing review workflow.</p>
   <button disabled={busy||readOnly||draft.to===role}>Save handoff</button>
  </form>
  <h3>Shared handoffs ({data.rows?.length||0})</h3>{!data.rows?.length&&<p>No handoffs in this view.</p>}
  {data.rows?.map(row=><article key={row.id}><h4>{row.title}</h4><p>{row.from} → {row.to} · {row.status} · Due: {row.due||'not set'}</p><p>{row.note}</p><p>Source: {row.sourceRef} · {row.sourceAsOf}</p><p>{row.authority}</p>
   <details><summary>Recorded history</summary><ol>{row.history.map((event,i)=><li key={i}>{event.at} · {event.actor} acting as {event.role} · {event.status}: {event.note}</li>)}</ol></details>
   {!['reported-complete','cancelled'].includes(row.status)&&<><label>Progress note or completion evidence<textarea maxLength={2000} value={notes[row.id]||''} onChange={e=>setNotes({...notes,[row.id]:e.target.value})}/></label>{HANDOFF_STATES.filter(status=>status!=='queued'&&(role===row.to||status==='cancelled'&&(role===row.from||role==='bruce'))).map(status=><button key={status} disabled={busy||readOnly||!notes[row.id]?.trim()} onClick={()=>save({action:'progress',id:row.id,version:row.version,status,note:notes[row.id]})}>{status==='reported-complete'?'Record reported completion':status}</button>)}</>}
  </article>)}
  <p>Analyst, Reviewer, Career and Creative role access is reserved for a later phase. No independent verification is inferred from reported completion.</p></>}
 </details>
}
