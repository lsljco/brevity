import {useEffect,useRef,useState} from 'react'
import {transcribeMeetingAudio} from '../finance/meetingApi.js'
export default function VoiceIdea({onText,onError,disabled}){
 const [state,setState]=useState('idle'),session=useRef(null),generation=useRef(0)
 const stop=()=>{const active=session.current;if(active?.recorder.state==='recording'){setState('transcribing');active.recorder.stop();active.stream.getTracks().forEach(track=>track.stop());clearTimeout(active.timer)}}
 useEffect(()=>()=>{generation.current++;const active=session.current;if(active){clearTimeout(active.timer);active.recorder.onstop=null;active.recorder.onerror=null;if(active.recorder.state==='recording')active.recorder.stop();active.stream.getTracks().forEach(track=>track.stop())}},[])
 async function start(){
  const run=++generation.current;let stream;setState('starting')
  try{
   if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('Recording is unavailable in this browser. Use your keyboard’s dictation microphone or type your idea.')
   stream=await navigator.mediaDevices.getUserMedia({audio:true});if(run!==generation.current){stream.getTracks().forEach(track=>track.stop());return}
   const recorder=new MediaRecorder(stream),parts=[];session.current={stream,recorder}
   recorder.ondataavailable=event=>{if(event.data.size)parts.push(event.data)}
   recorder.onerror=()=>{stream.getTracks().forEach(track=>track.stop());clearTimeout(session.current?.timer);if(run===generation.current){setState('idle');onError('Recording stopped unexpectedly. Please retry.')}}
   recorder.onstop=async()=>{
    stream.getTracks().forEach(track=>track.stop());clearTimeout(session.current?.timer)
    try{const result=await transcribeMeetingAudio(new Blob(parts,{type:recorder.mimeType}));if(run===generation.current){if(!result.text)throw Error('No speech was captured. Please try again.');onText(result.text)}}catch(error){if(run===generation.current)onError(error.message)}finally{if(run===generation.current){session.current=null;setState('idle')}}
   }
   recorder.start();setState('recording');session.current.timer=setTimeout(stop,60000)
  }catch(error){stream?.getTracks().forEach(track=>track.stop());if(run===generation.current){setState('idle');onError(error.name==='NotAllowedError'?'Allow microphone access to speak your idea. You can also type below.':error.message)}}
 }
 return <><button type="button" className="enh-primary" disabled={disabled||['starting','transcribing'].includes(state)} onClick={state==='recording'?stop:start}><i className="ti ti-microphone" aria-hidden="true"/>{state==='recording'?'Stop and transcribe':state==='starting'?'Opening microphone…':state==='transcribing'?'Transcribing…':'Speak your idea'}</button><small role="status">{state==='recording'?'Recording · up to 60 seconds. Tap Stop when finished.':'Your recording is transcribed into an editable draft.'}</small></>
}
