import {useCallback,useEffect,useRef,useState} from 'react'
import {ENHANCEMENT_AREAS,ENHANCEMENT_STATUSES,similarRequests} from './model.js'
import {enhancementRequest,enhancementDetail,prepareScreenshot} from './api.js'
import VoiceIdea from './VoiceIdea.jsx'
import './Enhancements.css'
const date=value=>new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})

function IdeaForm({member,rows,onClose,onSaved,onError}){
 const [description,setDescription]=useState(''),[title,setTitle]=useState(''),[area,setArea]=useState('General'),[screenshot,setScreenshot]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const id=useRef(crypto.randomUUID()),generation=useRef(0),descriptionRef=useRef('')
 useEffect(()=>()=>{generation.current++},[])
 const updateDescription=value=>{descriptionRef.current=value;setDescription(value)}
 const organize=async words=>{
  const run=++generation.current;setBusy(true);setMessage('Preparing your request…')
  try{const result=await enhancementRequest({member,action:'draft',description:words});if(run===generation.current&&descriptionRef.current===words){setTitle(result.title);setArea(result.area);setMessage('Review your request, then submit when ready.')}}
  catch(error){if(run===generation.current){setMessage('Your words are preserved. You can enter a title or retry.');onError(error.message)}}
  finally{if(run===generation.current)setBusy(false)}
 }
 const related=similarRequests(`${title} ${description}`,rows)
 async function submit(event){event.preventDefault();setBusy(true);try{const result=await enhancementRequest({member,action:'create',id:id.current,title,description,area,screenshot});onSaved(result.row)}catch(error){onError(error.message);setBusy(false)}}
 return <section className="enh-panel" aria-label="Share an idea"><header><h2>Share an idea</h2><button type="button" aria-label="Close new request" onClick={onClose}>×</button></header><p>Tell Brevity what would make things easier.</p>
  <VoiceIdea disabled={busy} onError={onError} onText={words=>{const next=[descriptionRef.current,words].filter(Boolean).join('\n');updateDescription(next);void organize(next)}}/>
  <form onSubmit={submit}><label>Your idea<textarea aria-label="Your idea" required maxLength={4000} value={description} onChange={event=>updateDescription(event.target.value)} placeholder="Remind me tonight if tomorrow’s dinner needs to thaw."/></label>
   <button type="button" disabled={busy||!description.trim()} onClick={()=>organize(description)}>Organize with Brevity</button><p role="status">{message}</p>
   <span className="enh-eyebrow">Request preview</span><label>Title<input required maxLength={140} value={title} onChange={event=>setTitle(event.target.value)}/></label><label>Area<select aria-label="Area" value={area} onChange={event=>setArea(event.target.value)}>{ENHANCEMENT_AREAS.map(name=><option key={name}>{name}</option>)}</select></label><small>Requested by: {member} · Visible to your household</small>
   {related.length>0&&<aside className="enh-related"><strong>Similar ideas already shared</strong><p>Consider supporting one instead. Your draft will stay here.</p>{related.map(row=><div key={row.id}><span>{row.title} · {row.status}</span><button type="button" disabled={busy||row.supporters.includes(member)} onClick={async()=>{setBusy(true);try{await enhancementRequest({member,action:'support',id:row.id,support:true});setMessage(`Your support for “${row.title}” was saved.`)}catch(error){onError(error.message)}finally{setBusy(false)}}}>{row.supporters.includes(member)?'Supported':'Support this idea'}</button></div>)}</aside>}
   <label>Attach a screenshot (optional)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async event=>{const file=event.target.files?.[0];if(!file)return;setBusy(true);try{setScreenshot(await prepareScreenshot(file))}catch(error){onError(error.message)}finally{setBusy(false)}}}/></label>
   {screenshot&&<div><img className="enh-screenshot" src={screenshot} alt="Screenshot to attach"/><button type="button" onClick={()=>setScreenshot(null)}>Remove screenshot</button></div>}
   <button className="enh-primary" disabled={busy||!title.trim()||!description.trim()} type="submit">{busy?'Please wait…':'Submit request'}</button><small>You’ll receive updates here and on devices with Brevity notifications enabled. A request does not authorize software changes.</small>
  </form></section>
}

function RequestDetail({row,member,canManage,onClose,onChange,onError}){
 const [comment,setComment]=useState(''),[status,setStatus]=useState(row.status),[priority,setPriority]=useState(row.priority),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[screenshot,setScreenshot]=useState(null)
 const commentId=useRef(crypto.randomUUID())
 useEffect(()=>{setStatus(row.status);setPriority(row.priority)},[row.status,row.priority])
 const change=async input=>{setBusy(true);try{await onChange({...input,id:row.id});return true}catch(error){onError(error.message);return false}finally{setBusy(false)}}
 return <section className="enh-panel" aria-label="Request details"><header><h2>{row.title}</h2><button type="button" aria-label="Close request details" onClick={onClose}>×</button></header><p className="enh-meta">{row.createdBy} · {row.area} · {date(row.createdAt)}</p><span className="enh-status">{row.status}</span><p className="enh-description">{row.description}</p>
  <button type="button" aria-pressed={row.supporters.includes(member)} disabled={busy} onClick={()=>change({action:'support',support:!row.supporters.includes(member)})}>{row.supporters.includes(member)?'Supported':'Support'} · {row.supporters.length}</button>
  {row.hasScreenshot&&<div>{screenshot?<img className="enh-screenshot" src={screenshot} alt={`Screenshot for ${row.title}`}/>:<button type="button" onClick={async()=>{try{setScreenshot((await enhancementDetail(row.id)).screenshot)}catch(error){onError(error.message)}}}>View screenshot</button>}</div>}
  {canManage&&<details className="enh-management"><summary>Manage status &amp; priority</summary><form onSubmit={async event=>{event.preventDefault();if(await change({action:'status',version:row.version,status,priority,note}))setNote('')}}><label>Status<select aria-label="Status" value={status} onChange={event=>setStatus(event.target.value)}>{ENHANCEMENT_STATUSES.map(value=><option key={value}>{value}</option>)}</select></label><label>Priority<select aria-label="Priority" value={priority} onChange={event=>setPriority(event.target.value)}>{['Low','Normal','High'].map(value=><option key={value}>{value}</option>)}</select></label><label>Update note<textarea aria-label="Update note" required maxLength={1000} value={note} onChange={event=>setNote(event.target.value)} placeholder="Explain the decision or ask for clarification."/></label><button className="enh-primary" disabled={busy||!note.trim()}>Save update</button><small>Status tracking does not approve code changes or deploy the app. Mark Available only after release verification.</small></form></details>}
  <h3>Discussion</h3>{row.comments.length?row.comments.map(item=><article className="enh-comment" key={item.id}><small>{item.actor} · {date(item.at)}</small><p>{item.text}</p></article>):<p>No comments yet. Add context or ask a question.</p>}
  <form onSubmit={async event=>{event.preventDefault();if(await change({action:'comment',text:comment,commentId:commentId.current})){setComment('');commentId.current=crypto.randomUUID()}}}><label>Add a comment<textarea aria-label="Add a comment" required maxLength={2000} value={comment} onChange={event=>setComment(event.target.value)}/></label><button disabled={busy||!comment.trim()}>Post comment</button></form>
  <details><summary>Request history</summary><ul>{row.history.filter(item=>item.kind!=='comment').map(item=><li key={item.id}><strong>{item.text}</strong><small>{item.actor} · {date(item.at)}</small></li>)}</ul></details>
 </section>
}

export default function Enhancements({currentMember}){
 const [data,setData]=useState({rows:[],updates:[],canManage:false}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('All requests'),[selected,setSelected]=useState(null),[creating,setCreating]=useState(false)
 const panel=useRef(null),sequence=useRef(0)
 const refresh=useCallback(async()=>{const run=++sequence.current;try{const result=await enhancementRequest();if(run===sequence.current){if(result.member!==currentMember)throw Error('The signed-in member changed. Reload Brevity.');setData(result);setError('')}}catch(error){if(run===sequence.current)setError(error.message)}finally{if(run===sequence.current)setLoading(false)}},[currentMember])
 useEffect(()=>{refresh();const timer=setInterval(refresh,60000);const focus=()=>{if(!document.hidden)refresh()};window.addEventListener('focus',focus);return()=>{sequence.current++;clearInterval(timer);window.removeEventListener('focus',focus)}},[refresh])
 useEffect(()=>{if(creating||selected)panel.current?.focus()},[creating,selected])
 const mutate=async input=>{await enhancementRequest({...input,member:currentMember});await refresh()}
 const open=row=>{setCreating(false);setSelected(row.id);mutate({action:'seen',id:row.id}).catch(error=>setError(error.message))}
 const visible=data.rows.filter(row=>(filter!=='My requests'||row.createdBy===currentMember)&&(!['Planned','Available'].includes(filter)||row.status===filter)&&`${row.title} ${row.description} ${row.area} ${row.createdBy}`.toLowerCase().includes(query.toLowerCase()))
 const selectedRow=data.rows.find(row=>row.id===selected)
 return <div className="enhancements-page"><header className="enh-heading"><div><span className="enh-eyebrow">Better together</span><h1>Enhancements</h1><p>Ideas that make daily life easier.</p></div><button className="enh-primary" onClick={()=>{setSelected(null);setCreating(true)}}>Share an idea</button></header>
  {error&&<div className="enh-error" role="alert">{error}<button onClick={refresh}>Reload board</button></div>}{notice&&<p role="status">{notice}</p>}
  {data.updates.length>0&&<details className="enh-updates"><summary>Your updates ({data.updates.length})</summary>{data.updates.map(item=><button key={`${item.requestId}:${item.id}`} onClick={()=>open({id:item.requestId})}><strong>{item.title}</strong><span>{item.text}</span><small>{item.actor} · {date(item.at)}</small></button>)}</details>}
  <div className={`enh-board${creating||selectedRow?' has-panel':''}`}><div className="enh-list"><div className="enh-toolbar"><label className="enh-search"><span className="sr-only">Search requests</span><input aria-label="Search requests" placeholder="Search requests" value={query} onChange={event=>setQuery(event.target.value)}/></label><div className="enh-filters" aria-label="Filter enhancement requests">{['All requests','My requests','Planned','Available'].map(value=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{value}</button>)}</div></div>
  {loading?<p role="status">Loading requests…</p>:visible.length?visible.map(row=><article className="enh-card" key={row.id}><div className="enh-card-heading"><button className="enh-title" onClick={()=>open(row)}>{row.title}</button><span className="enh-status">{row.status}</span></div><p>{row.description.slice(0,180)}{row.description.length>180?'…':''}</p><small>{row.createdBy} · {row.area}{row.priority==='High'?' · High priority':''}</small><footer><button aria-label={`${row.supporters.includes(currentMember)?'Remove support from':'Support'} ${row.title}`} aria-pressed={row.supporters.includes(currentMember)} onClick={()=>mutate({action:'support',id:row.id,support:!row.supporters.includes(currentMember)}).catch(error=>setError(error.message))}>↑ {row.supporters.includes(currentMember)?'Supported':'Support'} {row.supporters.length}</button><button onClick={()=>open(row)}>{row.comments.length?`${row.comments.length} comment${row.comments.length===1?'':'s'}`:'Add comment'}</button></footer></article>):<section className="enh-empty"><h2>{data.rows.length?'No matching requests':'What would make Brevity better?'}</h2><p>{data.rows.length?'Try another search or filter.':'Speak or type the first idea. Everyone in the household can contribute.'}</p></section>}
  <p className="enh-footnote">Support an existing idea or share a new one. Larry and Terica review priorities.</p></div>
  {(creating||selectedRow)&&<div className="enh-panel-wrap" ref={panel} tabIndex={-1}>{creating?<IdeaForm member={currentMember} rows={data.rows} onError={setError} onClose={()=>setCreating(false)} onSaved={row=>{setCreating(false);setSelected(row.id);setNotice('Your enhancement request was saved.');refresh()}}/>:<RequestDetail key={selectedRow.id} row={selectedRow} member={currentMember} canManage={data.canManage} onClose={()=>setSelected(null)} onError={setError} onChange={mutate}/>}</div>}
  </div></div>
}
