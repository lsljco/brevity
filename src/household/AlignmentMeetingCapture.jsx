import { useRef, useState, useEffect } from 'react'
import {useMeetingSession,startMeeting,stopMeeting,editMeetingText,downloadMeeting,openMeetingHistory,retainMeetingAnalysis,pauseMeeting,resumeMeeting} from '../meetings/meetingSession.js'
import { analyzeAlignmentTranscript } from './alignmentMeetingApi.js'
import { normalizeAlignmentMeetingResult,alignmentAnalysisKey } from './alignmentMeeting.js'

export default function AlignmentMeetingCapture({plan, timing='tomorrow', currentMember='Larry', readOnly=false, financeReadOnly=false, onApply}) {
  const session=useMeetingSession(), record=session.record?.member===currentMember&&session.record?.kind==='alignment'&&session.record?.date===plan.date?session.record:null
  const isRecording=session.recording, startedAt=record?.startedAt, transcript=record?.transcript||'', notes=record?.notes||'', transcribing=session.transcribing
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null),[notice,setNotice]=useState('')
  const fileRef=useRef(null),latest=useRef(''),requestSequence=useRef(0),analyzedKey=useRef('')
  const inputKey=alignmentAnalysisKey({plan,transcript,notes,meetingId:record?.id})
  latest.current=inputKey
  useEffect(()=>{setResult(null);setNotice('');requestSequence.current++},[inputKey])
  useEffect(()=>()=>{requestSequence.current++},[])

  const label=timing==='today'?'Today’s Alignment':'Tomorrow’s Alignment'
  const scope={member:currentMember,date:plan.date,timing,kind:'alignment'}
  const invalidate=()=>{setResult(null);setNotice('')}
  const setTranscript=value=>editMeetingText(scope,'transcript',value)
  const setNotes=value=>editMeetingText(scope,'notes',value)
  const start=()=>{if(readOnly)return;invalidate();startMeeting({...scope,title:label})}
  const stop=()=>{stopMeeting();setNotice('Meeting stopped. Captured audio and transcript are retained in Meeting History; transcription may still be finishing.')}
  const saveRecording=()=>downloadMeeting(record).catch(cause=>setError(cause.message))
  const importTranscript=event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;const reader=new FileReader();reader.onload=()=>{setTranscript(String(reader.result||''));invalidate()};reader.readAsText(file)}
  const analyze=async()=>{if(!transcript.trim())return;const key=inputKey,sequence=++requestSequence.current;setBusy(true);setError('');try{const next=normalizeAlignmentMeetingResult(await analyzeAlignmentTranscript({transcript,notes,timing,plan}));if(sequence!==requestSequence.current||key!==latest.current){setNotice('The plan or transcript changed during analysis. Analyze again to use the latest information.');return}analyzedKey.current=key;setResult(next);retainMeetingAnalysis(record.id,{summary:next.summary,unresolved:next.unresolved,analyzedAt:new Date().toISOString(),planDate:plan.date});setNotice('Summary saved with this meeting. Proposed changes still require your review.')}catch(reason){setError(reason.message||'Brevity could not analyze this alignment.')}finally{setBusy(false)}}
  const apply=()=>{if(!result||analyzedKey.current!==latest.current){setError('The plan or transcript changed. Analyze again before applying suggestions.');return}onApply(result);setResult(null);setNotice(`Suggestions added to the local ${label} draft. Confirm owners and dates, then review the plan before saving. Existing tasks and completion records are preserved.`)}


  if(readOnly)return null
  return <section className={`alignment-meeting-capture${isRecording?' is-recording':''}`} aria-label={`${label} meeting capture`}>
    <div className="alignment-meeting-title"><div><span>Meeting Capture</span><strong>Run {label} as a recorded household meeting</strong><small>Recording continues across Brevity screens. Audio and transcripts save to your Meeting History. Use Stop Meeting to finish.</small></div><div>{isRecording?<button type="button" className="alignment-meeting-stop" onClick={stop}><span/> Stop Meeting</button>:<button type="button" className="alignment-meeting-start" disabled={session.starting||session.saving||transcribing>0} onClick={start}><i className="ti ti-microphone" aria-hidden="true"/> Start Meeting</button>}</div></div>
    {isRecording&&<div className="alignment-meeting-recording" role="status"><span/><strong>{session.paused?'Paused · no new audio captured':'Recording + transcription active'}</strong><small>{transcribing?'Transcribing the latest segment…':'The master recording continues without interruption.'}</small></div>}
    <div className="alignment-meeting-actions">{isRecording&&<button onClick={session.paused?resumeMeeting:pauseMeeting}>{session.paused?'Resume recording':'Pause recording'}</button>}<button type="button" onClick={openMeetingHistory,retainMeetingAnalysis,pauseMeeting,resumeMeeting}>Meeting History</button><button type="button" disabled={isRecording||transcribing>0} onClick={()=>fileRef.current?.click()}><i className="ti ti-file-upload"/> Import Otter</button><input ref={fileRef} type="file" accept=".txt,.vtt,.srt,text/plain,text/vtt" onChange={importTranscript} hidden/>{record?.chunkCount>0&&<button type="button" onClick={saveRecording}><i className="ti ti-download"/> Save recording</button>}<button type="button" onClick={analyze} disabled={busy||isRecording||transcribing>0||!transcript.trim()}><i className="ti ti-sparkles"/> {busy?'Analyzing…':'Analyze with Brevity'}</button>{result&&<button type="button" className="alignment-meeting-apply" onClick={apply}>Apply Suggestions to Draft</button>}</div>
    {session.error&&<div className="alignment-error" role="alert">{session.error}</div>}{notice&&<div className="alignment-meeting-notice" role="status">{notice}</div>}{error&&<div className="alignment-error" role="alert">{error}</div>}
    {result&&<div className="alignment-meeting-summary"><strong>Brevity summary · draft</strong><p>{result.summary||'The transcript was analyzed. Review the proposed pillar updates before applying them.'}</p>{result.unresolved.length>0&&<small>Still unresolved: {result.unresolved.join(' · ')}</small>}</div>}
    <textarea aria-label={`${label} transcript`} readOnly={isRecording||transcribing>0} value={transcript} onChange={event=>{setTranscript(event.target.value);invalidate()}} rows="7" placeholder="Live transcription appears here. You can also paste or import an Otter transcript."/>
    <textarea aria-label={`${label} meeting notes`} readOnly={isRecording&&!record} value={notes} onChange={event=>{setNotes(event.target.value);invalidate()}} rows="3" placeholder="Optional alignment notes or unresolved context…"/>
    {startedAt&&<small className="alignment-meeting-started">Meeting started {new Date(startedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small>}
  </section>
}
