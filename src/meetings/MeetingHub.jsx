import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {useMeetingSession,restoreMeeting,detachMeeting,stopMeeting,pauseMeeting,resumeMeeting,meetingElapsed,openMeetingHistory,closeMeetingHistory,retryMeetingBackup,downloadMeeting} from './meetingSession.js'
import {listMeetings,meetingAudio,pinMeeting} from './meetingArchive.js'
import './MeetingHub.css'
export default function MeetingHub({member,compact=false}){
 const dialog=useRef(null)
 const [clock,setClock]=useState(Date.now())
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer)},[])
 const session=useMeetingSession(),[rows,setRows]=useState([]),[selected,setSelected]=useState(null),[url,setUrl]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false)
 useEffect(()=>{restoreMeeting(member);return()=>detachMeeting()},[member])
 useEffect(()=>{if(!session.historyOpen)return;let current=true;setLoading(true);listMeetings(member).then(result=>{if(current){setRows(result.meetings);setError(result.error)}}).catch(cause=>{if(current)setError(cause.message)}).finally(()=>{if(current)setLoading(false)});return()=>{current=false}},[session.historyOpen,member,session.record?.updatedAt])
 useEffect(()=>{if(!selected)return;let current=true;setUrl('');setError('');let objectUrl
  if(selected.chunkCount)meetingAudio(selected).then(blob=>{if(current){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}}).catch(cause=>{if(current)setError(cause.message)})
  return()=>{current=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}
 },[selected])
 useEffect(()=>{if(!session.historyOpen)return;const previous=document.activeElement;const close=event=>{if(event.key==='Escape'){closeMeetingHistory();setSelected(null)}if(event.key==='Tab'){const nodes=[...(dialog.current?.querySelectorAll('button:not(:disabled),audio[controls],[tabindex="0"]')||[])];const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}};window.addEventListener('keydown',close);return()=>{window.removeEventListener('keydown',close);previous?.focus?.()}},[session.historyOpen])
 const record=session.record?.member===member?session.record:null
 const safe=action=>Promise.resolve().then(action).catch(cause=>setError(cause.message))
 return <>
  <section className={`meeting-hub${session.recording?' is-recording':''}${compact?' is-compact':''}`} aria-label="Meeting recorder">
   {Boolean(!compact||session.recording||session.saving||session.transcribing)&&<div>{session.recording?<><strong>{session.paused?'Ⅱ Paused':'● Recording'} · {record?.title} · {Math.floor(meetingElapsed(record,clock)/60)}:{String(meetingElapsed(record,clock)%60).padStart(2,'0')}</strong><span>{session.paused?'Audio and transcription capture paused.':'Continues as you move between screens.'}</span></>:<span>{session.saving?'Saving captured audio…':session.transcribing?'Finishing meeting transcription…':'Meeting recordings & transcripts'}</span>}</div>}
   <div>{session.recording&&<><button onClick={session.paused?resumeMeeting:pauseMeeting}>{session.paused?'Resume recording':'Pause recording'}</button><button onClick={()=>stopMeeting()}>Stop Meeting</button></>}<button onClick={openMeetingHistory}>Meeting History</button></div>
   {record&&(session.error||(!compact&&session.backup))&&<small role="status">{session.error||session.backup}{session.error&&<button onClick={()=>safe(()=>retryMeetingBackup())}>Retry backup</button>}</small>}
  </section>
  {session.historyOpen&&createPortal(<div className="meeting-history-backdrop"><section ref={dialog} className="meeting-history" role="dialog" aria-modal="true" aria-label="Meeting History"><header><div><h2>Meeting History</h2><p>Your saved recordings and transcripts · {member} · Rolling 12 months; pinned and finance meetings retained</p></div><button autoFocus onClick={()=>{closeMeetingHistory();setSelected(null)}} aria-label="Close Meeting History">Close</button></header>
   <p>Audio saves throughout the meeting. Interrupted meetings retain the portions already captured. Transcription may finish after you stop.</p>
   {loading&&<p role="status">Loading meeting history…</p>}{error&&<p role="alert">{error}</p>}
   <div className="meeting-history-layout"><nav aria-label="Saved meetings">{rows.map(row=><button key={row.id} onClick={()=>setSelected(row)} aria-pressed={selected?.id===row.id}><strong>{row.title}</strong><span>{new Date(row.startedAt).toLocaleString()} · {row.date}</span><small>{row.status==='recording'&&row.id!==record?.id?'Interrupted or open on another device':row.status} · {row.chunkCount||0} audio portions</small></button>)}{!loading&&!rows.length&&<p>No saved meetings yet.</p>}</nav>
   {selected&&<article><h3>{selected.title}</h3>{url&&<audio aria-label="Meeting playback" controls src={url}/>}<div className="meeting-history-actions"><button onClick={()=>safe(async()=>{const updated=await pinMeeting(selected,!selected.pinned);setSelected(updated);setRows(rows=>rows.map(row=>row.id===updated.id?updated:row))})}>{selected.pinned?'Unpin meeting':'Pin meeting'}</button>{selected.chunkCount>0&&<button onClick={()=>safe(()=>downloadMeeting(selected))}>Download recording</button>}<button onClick={()=>safe(()=>retryMeetingBackup(selected))}>Retry cloud backup</button></div>{selected.transcriptionErrors?.length>0&&<p role="status">Some transcript segments could not be processed. Review the recording for the complete captured audio.</p>}{selected.analysis&&<section><h4>Meeting summary · proposed changes</h4><p>{selected.analysis.summary}</p>{selected.analysis.unresolved?.length>0&&<><h4>Still to agree</h4><ul>{selected.analysis.unresolved.map((text,i)=><li key={i}>{text}</li>)}</ul></>}<p>Analysis is a proposal; saving this summary does not change the daily plan.</p></section>}<h4>Transcript</h4><pre>{selected.transcript||'No transcript was captured.'}</pre><h4>Notes</h4><pre>{selected.notes||'No meeting notes.'}</pre></article>}</div>
  </section></div>,document.body)}
 </>
}
