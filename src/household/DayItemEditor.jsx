import {useEffect,useRef,useState} from 'react'
import {createDaySave,dayItemChange,undoDaySave} from './directDayActions.js'
export default function DayItemEditor({plan,item,onClose}){
 const region=useRef(null)
 useEffect(()=>{region.current?.scrollIntoView({block:'center',behavior:'smooth'});region.current?.querySelector('select')?.focus({preventScroll:true})},[])
 const [status,setStatus]=useState(item.status||'pending'),[date,setDate]=useState(item.date||item.originalDate||plan.date),[notes,setNotes]=useState(item.notes||'')
 const [phase,setPhase]=useState('idle'),[error,setError]=useState(''),[audit,setAudit]=useState(null),pending=useRef(null),lock=useRef(false)
 const save=async patch=>{if(lock.current)return;lock.current=true;setPhase('saving');setError('');try{pending.current ||= createDaySave(dayItemChange(plan,item,patch));const saved=await pending.current();setAudit(saved);setPhase('saved')}catch(e){setError(e.message);setPhase('error')}finally{lock.current=false}}
 const undo=async()=>{if(lock.current)return;lock.current=true;setPhase('saving');setError('');try{await undoDaySave(audit);setPhase('undone')}catch(e){setError(e.message);setPhase('saved')}finally{lock.current=false}}
 const frozen=phase!=='idle'
 return <section ref={region} className="today-guidance-card day-item-editor" aria-label={`Update ${item.title}`}><header><div><h2>{item.title}</h2><p>{item.owner||'Family'} · Saved record from {item.sourceDate||plan.date}</p></div><button disabled={phase==='saving'} onClick={onClose}>Close</button></header>
 <fieldset disabled={frozen}><label>Status<select aria-label="Status" value={status} onChange={e=>setStatus(e.target.value)}>{['pending','ready','in-progress','complete','deferred'].map(value=><option key={value} value={value}>{value.replaceAll('-',' ')}</option>)}</select></label><label>Scheduled date<input aria-label="Scheduled date" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Notes<textarea aria-label="Notes" value={notes} onChange={e=>setNotes(e.target.value)}/></label></fieldset>
 <div className="day-item-actions">{phase==='idle'&&<><button onClick={()=>{setStatus('complete');save({status:'complete'})}}>Mark complete</button><button onClick={()=>save({...((status!==item.status)?{status}:{}),...((date!==(item.date||item.originalDate||plan.date))?{date}:{}),...((notes!==(item.notes||''))?{notes}:{})})}>Save changes</button></>}{phase==='saving'&&<span role="status">Saving…</span>}{phase==='saved'&&<><span role="status">Saved</span><button onClick={undo}>Undo</button></>}{phase==='undone'&&<span role="status">Undone</span>}{phase==='error'&&<><span role="status">Save not confirmed · Your change is retained here.</span><button onClick={()=>save({...((status!==item.status)?{status}:{}),...((date!==(item.date||item.originalDate||plan.date))?{date}:{}),...((notes!==(item.notes||''))?{notes}:{})})}>Retry save</button></>}</div>{error&&<p role="alert">{error}</p>}
 </section>
}
