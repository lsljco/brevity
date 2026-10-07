import { useRef, useState } from 'react'
import {useMeetingSession,startMeeting,stopMeeting,editMeetingText,downloadMeeting,openMeetingHistory} from '../meetings/meetingSession.js'
import { analyzeAlignmentTranscript } from './alignmentMeetingApi.js'
import { normalizeAlignmentMeetingResult } from './alignmentMeeting.js'

export default function AlignmentMeetingCapture({plan, timing='tomorrow', currentMember='Larry', readOnly=false, financeReadOnly=false, onApply}) {
  const session=useMeetingSession(), record=session.record?.member===currentMember&&session.record?.kind==='alignment'&&session.record?.date===plan.date?session.record:null
  const isRecording=session.recording, startedAt=record?.startedAt, transcript=record?.transcript||'', notes=record?.notes||'', transcribing=session.transcribing
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null),[notice,setNotice]=useState('')
  const fileRef=useRef(null)
  const label=timing==='today'?'Today’s Alignment':'Tomorrow’s Alignment'
  const scope={member:currentMember,date:plan.date,timing,kind:'alignment'}
  const invalidate=()=>{setResult(null);setNotice('')}
  const setTranscript=value=>editMeetingText(scope,'transcript',value)
  const setNotes=value=>editMeetingText(scope,'notes',value)
  const start=()=>{if(readOnly)return;invalidate();startMeeting({...scope,title:label})}
  const stop=()=>{stopMeeting();setNotice('Meeting stopped. Captured audio and transcript are retained in Meeting History; transcription may still be finishing.')}
  const saveRecording=()=>downloadMeeting(record).catch(cause=>setError(cause.message))
  const importTranscript=event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;const reader=new FileReader();reader.onload=()=>{setTranscript(String(reader.result||''));invalidate()};reader.readAsText(file)}
  const analyze=async()=>{if(!transcript.trim())return;setBusy(true);setError('');try{const next=normalizeAlignmentMeetingResult(await analyzeAlignmentTranscript({transcript,notes,timing,plan}));setResult(next);setNotice('Analysis is ready. Nothing has changed yet; review the summary before applying it to this local alignment draft.')}catch(reason){setError(reason.message||'Brevity could not analyze this alignment.')}finally{setBusy(false)}}
  const apply=()=>{if(!result)return;onApply(result);setNotice(`Brevity’s suggestions were added to the local ${label} draft${financeReadOnly?' without changing protected Finance fields':''}. Review all seven pillars, then use Review & Complete Alignment to open Action Mode.`)}

  if(readOnly)return null
  return <section className={`alignment-meeting-capture${isRecording?' is-recording':''}`} aria-label={`${label} meeting capture`}>
    <div className="alignment-meeting-title"><div><span>Meeting Capture</span><strong>Run {label} as a recorded household meeting</strong><small>Recording continues across Brevity screens. Audio and transcripts save to your Meeting History. Use Stop Meeting to finish.</small></div><div>{isRecording?<button type="button" className="alignment-meeting-stop" onClick={stop}><span/> Stop Meeting</button>:<button type="button" className="alignment-meeting-start" disabled={session.starting||session.saving||transcribing>0} onClick={start}><i className="ti ti-microphone" aria-hidden="true"/> Start Meeting</button>}</div></div>
    {isRecording&&<div className="alignment-meeting-recording" role="status"><span/><strong>Recording + transcription active</strong><small>{transcribing?'Transcribing the latest segment…':'The master recording continues without interruption.'}</small></div>}
    <div className="alignment-meeting-actions"><button type="button" onClick={openMeetingHistory}>Meeting History</button><button type="button" disabled={isRecording||transcribing>0} onClick={()=>fileRef.current?.click()}><i className="ti ti-file-upload"/> Import Otter</button><input ref={fileRef} type="file" accept=".txt,.vtt,.srt,text/plain,text/vtt" onChange={importTranscript} hidden/>{record?.chunkCount>0&&<button type="button" onClick={saveRecording}><i className="ti ti-download"/> Save recording</button>}<button type="button" onClick={analyze} disabled={busy||isRecording||transcribing>0||!transcript.trim()}><i className="ti ti-sparkles"/> {busy?'Analyzing…':'Analyze with Brevity'}</button>{result&&<button type="button" className="alignment-meeting-apply" onClick={apply}>Apply Suggestions to Draft</button>}</div>
    {session.error&&<div className="alignment-error" role="alert">{session.error}</div>}{notice&&<div className="alignment-meeting-notice" role="status">{notice}</div>}{error&&<div className="alignment-error" role="alert">{error}</div>}
    {result&&<div className="alignment-meeting-summary"><strong>Brevity summary · draft</strong><p>{result.summary||'The transcript was analyzed. Review the proposed pillar updates before applying them.'}</p>{result.unresolved.length>0&&<small>Still unresolved: {result.unresolved.join(' · ')}</small>}</div>}
    <textarea aria-label={`${label} transcript`} readOnly={isRecording||transcribing>0} value={transcript} onChange={event=>{setTranscript(event.target.value);invalidate()}} rows="7" placeholder="Live transcription appears here. You can also paste or import an Otter transcript."/>
    <textarea aria-label={`${label} meeting notes`} readOnly={isRecording&&!record} value={notes} onChange={event=>{setNotes(event.target.value);invalidate()}} rows="3" placeholder="Optional alignment notes or unresolved context…"/>
    {startedAt&&<small className="alignment-meeting-started">Meeting started {new Date(startedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small>}
  </section>
}
