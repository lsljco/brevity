import { useEffect, useRef, useState } from 'react'
import { analyzeAlignmentTranscript, transcribeAlignmentAudio } from './alignmentMeetingApi.js'
import { normalizeAlignmentMeetingResult } from './alignmentMeeting.js'

export default function AlignmentMeetingCapture({plan, timing='tomorrow', readOnly=false, financeReadOnly=false, onApply}) {
  const [isRecording,setIsRecording]=useState(false),[startedAt,setStartedAt]=useState(null),[transcript,setTranscript]=useState(''),[notes,setNotes]=useState('')
  const [transcribing,setTranscribing]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null),[notice,setNotice]=useState('')
  const masterRef=useRef(null),segmentRef=useRef(null),streamRef=useRef(null),masterChunks=useRef([]),segmentTimer=useRef(null),recordingFlag=useRef(false),fileRef=useRef(null)
  const label=timing==='today'?'Today’s Alignment':'Tomorrow’s Alignment'

  useEffect(()=>()=>{recordingFlag.current=false;clearTimeout(segmentTimer.current);if(segmentRef.current?.state==='recording')segmentRef.current.stop();if(masterRef.current?.state==='recording')masterRef.current.stop();streamRef.current?.getTracks().forEach(track=>track.stop())},[])
  const invalidate=()=>{setResult(null);setNotice('')}
  const appendTranscript=value=>{const cleaned=String(value||'').trim();if(!cleaned)return;setTranscript(current=>`${current}${current?'\n':''}${cleaned}`);invalidate()}
  const runSegment=stream=>{
    if(!recordingFlag.current)return
    let recorder
    try{recorder=new MediaRecorder(stream)}catch{return}
    const parts=[];segmentRef.current=recorder
    recorder.ondataavailable=event=>{if(event.data?.size)parts.push(event.data)}
    recorder.onstop=async()=>{clearTimeout(segmentTimer.current);if(parts.length){const blob=new Blob(parts,{type:parts[0]?.type||recorder.mimeType||'audio/webm'});setTranscribing(value=>value+1);try{appendTranscript((await transcribeAlignmentAudio(blob)).text)}catch(reason){setError(reason.message||'A meeting segment could not be transcribed. The master recording was not interrupted.')}finally{setTranscribing(value=>Math.max(0,value-1))}}if(recordingFlag.current)runSegment(stream)}
    recorder.start();segmentTimer.current=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},25000)
  }
  const start=async()=>{
    if(readOnly)return
    setError('');setResult(null);setNotice('');setTranscript('');setNotes('');masterChunks.current=[]
    let stream
    try{stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;const master=new MediaRecorder(stream);masterRef.current=master;master.ondataavailable=event=>{if(event.data?.size)masterChunks.current.push(event.data)};master.onstop=()=>{stream.getTracks().forEach(track=>track.stop());streamRef.current=null};recordingFlag.current=true;master.start(30000);runSegment(stream);setStartedAt(new Date().toISOString());setIsRecording(true)}catch(reason){stream?.getTracks().forEach(track=>track.stop());setError(reason?.message||'Brevity could not start the alignment recording.')}
  }
  const stop=()=>{recordingFlag.current=false;clearTimeout(segmentTimer.current);if(segmentRef.current?.state==='recording')segmentRef.current.stop();if(masterRef.current?.state==='recording')masterRef.current.stop();setIsRecording(false);setNotice('Recording ended. Review the transcript, then analyze it with Brevity.')}
  const saveRecording=()=>{if(!masterChunks.current.length)return;const type=masterChunks.current[0]?.type||'audio/webm',blob=new Blob(masterChunks.current,{type}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`brevity-${timing}-alignment-${plan.date}.${/mp4/.test(type)?'m4a':'webm'}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
  const importTranscript=event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;const reader=new FileReader();reader.onload=()=>{setTranscript(String(reader.result||''));invalidate()};reader.readAsText(file)}
  const analyze=async()=>{if(!transcript.trim())return;setBusy(true);setError('');try{const next=normalizeAlignmentMeetingResult(await analyzeAlignmentTranscript({transcript,notes,timing,plan}));setResult(next);setNotice('Analysis is ready. Nothing has changed yet; review the summary before applying it to this local alignment draft.')}catch(reason){setError(reason.message||'Brevity could not analyze this alignment.')}finally{setBusy(false)}}
  const apply=()=>{if(!result)return;onApply(result);setNotice(`Brevity’s suggestions were added to the local ${label} draft${financeReadOnly?' without changing protected Finance fields':''}. Review all seven pillars, then use Review & Complete Alignment to open Action Mode.`)}

  if(readOnly)return null
  return <section className={`alignment-meeting-capture${isRecording?' is-recording':''}`} aria-label={`${label} meeting capture`}>
    <div className="alignment-meeting-title"><div><span>Meeting Capture</span><strong>Run {label} as a recorded household meeting</strong><small>Recording, live transcription, transcript import, and Brevity analysis use the same meeting workflow as Finance.</small></div><div>{isRecording?<button type="button" className="alignment-meeting-stop" onClick={stop}><span/> End Meeting</button>:<button type="button" className="alignment-meeting-start" onClick={start}><i className="ti ti-microphone"/> Start Meeting</button>}</div></div>
    {isRecording&&<div className="alignment-meeting-recording" role="status"><span/><strong>Recording + transcription active</strong><small>{transcribing?'Transcribing the latest segment…':'The master recording continues without interruption.'}</small></div>}
    <div className="alignment-meeting-actions"><button type="button" onClick={()=>fileRef.current?.click()}><i className="ti ti-file-upload"/> Import Otter</button><input ref={fileRef} type="file" accept=".txt,.vtt,.srt,text/plain,text/vtt" onChange={importTranscript} hidden/>{masterChunks.current.length>0&&<button type="button" onClick={saveRecording}><i className="ti ti-download"/> Save recording</button>}<button type="button" onClick={analyze} disabled={busy||!transcript.trim()}><i className="ti ti-sparkles"/> {busy?'Analyzing…':'Analyze with Brevity'}</button>{result&&<button type="button" className="alignment-meeting-apply" onClick={apply}>Apply Suggestions to Draft</button>}</div>
    {notice&&<div className="alignment-meeting-notice" role="status">{notice}</div>}{error&&<div className="alignment-error" role="alert">{error}</div>}
    {result&&<div className="alignment-meeting-summary"><strong>Brevity summary · draft</strong><p>{result.summary||'The transcript was analyzed. Review the proposed pillar updates before applying them.'}</p>{result.unresolved.length>0&&<small>Still unresolved: {result.unresolved.join(' · ')}</small>}</div>}
    <textarea aria-label={`${label} transcript`} value={transcript} onChange={event=>{setTranscript(event.target.value);invalidate()}} rows="7" placeholder="Live transcription appears here. You can also paste or import an Otter transcript."/>
    <textarea aria-label={`${label} meeting notes`} value={notes} onChange={event=>{setNotes(event.target.value);invalidate()}} rows="3" placeholder="Optional alignment notes or unresolved context…"/>
    {startedAt&&<small className="alignment-meeting-started">Meeting started {new Date(startedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small>}
  </section>
}
