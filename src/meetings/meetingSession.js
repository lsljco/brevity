import {useSyncExternalStore} from 'react'
import {saveMeetingLocal,saveMeetingChunk,syncMeeting,listLocalMeetings,meetingAudio} from './meetingArchive.js'
import {transcribeAlignmentAudio} from '../household/alignmentMeetingApi.js'

// One recorder belongs to the signed-in app session, never to a routed screen.
const listeners=new Set()
let state={record:null,recording:false,starting:false,transcribing:0,error:'',saving:false,backup:'',historyOpen:false}
let stream,master,segment,timer,sequence=0,chunkIndex=0,segments=[],manualTranscript='',queue=Promise.resolve(),localQueue=Promise.resolve(),stopPromise=null,resolveStop=null,epoch=0
const publish=patch=>{state={...state,...patch};listeners.forEach(listener=>listener())}
export const meetingSnapshot=()=>state
export const subscribeMeeting=listener=>{listeners.add(listener);return()=>listeners.delete(listener)}
export const useMeetingSession=()=>useSyncExternalStore(subscribeMeeting,meetingSnapshot,meetingSnapshot)
export const openMeetingHistory=()=>publish({historyOpen:true})
export const closeMeetingHistory=()=>publish({historyOpen:false})
function persist(){
 const record=state.record
 if(!record)return Promise.resolve()
 localQueue=localQueue.catch(()=>{}).then(()=>saveMeetingLocal(record)).catch(cause=>publish({error:`Device recovery save failed: ${cause.message}. Keep this page open and download the recording.`}))
 queue=queue.catch(()=>{}).then(async()=>{await localQueue;await syncMeeting(record);publish({backup:'Saved to your meeting history'})}).catch(cause=>publish({backup:'Saved on this device · cloud backup pending',error:cause.message}))
 return localQueue
}
function updateRecord(patch){publish({record:{...state.record,...patch,updatedAt:new Date().toISOString()}});persist()}
export async function restoreMeeting(member){
 const generation=++epoch
 if(state.record?.member===member)return
 if(state.recording||state.starting)await stopMeeting('interrupted')
 publish({record:null,error:'',backup:'',historyOpen:false})
 try{const records=await listLocalMeetings(member);const record=records.sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0];if(!record||generation!==epoch||state.recording||state.starting)return
  publish({record:{...record,status:record.status==='recording'?'interrupted':record.status}})
  manualTranscript=record.transcript||'';segments=[]
  persist()
 }catch(cause){publish({error:`Meeting recovery could not load: ${cause.message}`})}
}
function recorderFor(source){
 const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported?.(type))
 return new MediaRecorder(source,mime?{mimeType:mime}:undefined)
}
function runSegment(source,id){
 if(!state.recording||state.record?.id!==id)return
 let recorder;try{recorder=recorderFor(source)}catch(cause){publish({error:`Live transcription unavailable: ${cause.message}. Audio recording continues.`});return}
 const parts=[],index=sequence++;segment=recorder
 recorder.ondataavailable=event=>{if(event.data?.size)parts.push(event.data)}
 recorder.onstop=()=>{
  clearTimeout(timer)
  // Restart capture immediately; transcription latency must not create gaps.
  if(state.recording&&state.record?.id===id)runSegment(source,id)
  if(!parts.length)return
  publish({transcribing:state.transcribing+1})
  transcribeAlignmentAudio(new Blob(parts,{type:recorder.mimeType||parts[0].type})).then(result=>{
   if(state.record?.id!==id)return
   segments[index]=String(result.text||'').trim()
   updateRecord({transcript:[manualTranscript,...segments.filter(Boolean)].filter(Boolean).join('\n')})
  }).catch(cause=>{if(state.record?.id===id){updateRecord({transcriptionErrors:[...(state.record.transcriptionErrors||[]),index]});publish({error:`Transcript segment ${index+1} could not be processed. Saved audio is retained. ${cause.message}`})}}).finally(()=>publish({transcribing:Math.max(0,state.transcribing-1)}))
 }
 recorder.onerror=()=>publish({error:'Live transcription was interrupted. The audio recording remains available.'})
 recorder.start();timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},25000)
}
export async function startMeeting({member,date,timing='today',kind='alignment',title}){
 if(state.recording||state.starting||state.saving||state.transcribing){publish({error:'Finish the active meeting and its transcription before starting another.'});return}
 const generation=++epoch
 publish({starting:true,error:''})
 try{
  const source=await navigator.mediaDevices.getUserMedia({audio:true})
  if(generation!==epoch){source.getTracks().forEach(track=>track.stop());return}
  stream=source;master=recorderFor(source);const id=crypto.randomUUID(),now=new Date().toISOString()
  segments=[];manualTranscript='';sequence=0;chunkIndex=0
  const record={id,member,date,timing,kind,title:title||`${timing==='today'?'Today’s':'Tomorrow’s'} Alignment`,startedAt:now,endedAt:null,status:'recording',transcript:'',notes:'',chunkCount:0,mime:master.mimeType||'audio/webm',transcriptionErrors:[],updatedAt:now}
  // Refuse to start without a writable recovery store.
  await saveMeetingLocal(record)
  if(generation!==epoch){source.getTracks().forEach(track=>track.stop());return}
  publish({record,recording:true,starting:false,backup:'Recording · saving audio every five seconds'})
  master.ondataavailable=event=>{
   if(!event.data?.size)return
   const index=chunkIndex++,snapshot=state.record
   localQueue=localQueue.catch(()=>{}).then(()=>saveMeetingChunk(snapshot,index,event.data)).catch(cause=>{publish({error:`Audio recovery save failed: ${cause.message}. Recording has stopped to protect captured audio.`});stopMeeting('interrupted')})
   updateRecord({chunkCount:chunkIndex})
  }
  master.onerror=()=>{publish({error:'The microphone recording was interrupted. Captured portions are retained.'});stopMeeting('interrupted')}
  master.onstop=()=>{
   if(state.recording)stopMeeting('interrupted')
   source.getTracks().forEach(track=>track.stop());stream=null
   updateRecord({status:state.record.status==='recording'?'interrupted':state.record.status,endedAt:state.record.endedAt||new Date().toISOString()})
   localQueue.finally(()=>{publish({saving:false});resolveStop?.();resolveStop=null})
  }
  source.getTracks().forEach(track=>track.addEventListener('ended',()=>{if(state.recording)stopMeeting('interrupted')},{once:true}))
  master.start(5000);runSegment(source,id);persist()
 }catch(cause){stream?.getTracks().forEach(track=>track.stop());stream=null;publish({starting:false,recording:false,error:cause.message||'Could not start the microphone.'})}
}
export async function stopMeeting(reason='stopped'){
 if(!state.recording)return stopPromise
 stopPromise=new Promise(resolve=>{resolveStop=resolve})
 publish({recording:false,saving:true})
 clearTimeout(timer)
 updateRecord({status:reason,endedAt:new Date().toISOString()})
 if(segment?.state==='recording')segment.stop()
 if(master?.state==='recording')master.stop()
 else {stream?.getTracks().forEach(track=>track.stop());localQueue.finally(()=>{publish({saving:false});resolveStop?.();resolveStop=null})}
 return stopPromise
}
export function editMeetingText({member,date,timing,kind='alignment'},field,value){
 if(field==='transcript'&&(state.recording||state.transcribing)){publish({error:'Wait until recording and transcription finish before replacing the transcript.'});return}
 if((state.recording||state.saving||state.transcribing)&&(state.record?.member!==member||state.record?.kind!==kind||state.record?.date!==date)){publish({error:'Finish the active meeting before editing a different meeting transcript.'});return}
 if(!state.record||(!state.recording&&(state.record.member!==member||state.record.date!==date||state.record.kind!==kind))){
  const now=new Date().toISOString();segments=[];manualTranscript=''
  publish({record:{id:crypto.randomUUID(),member,date,timing,kind,title:kind==='finance'?'Finance Meeting':`${timing==='today'?'Today’s':'Tomorrow’s'} Alignment`,startedAt:now,endedAt:now,status:'draft',transcript:'',notes:'',chunkCount:0,updatedAt:now}})
 }
 if(field==='transcript'){manualTranscript=value;segments=[]}
 updateRecord({[field]:value})
}
export async function retryMeetingBackup(record=state.record){if(!record)return;await localQueue;await syncMeeting(record);publish({error:'',backup:'Saved to your meeting history'})}
export async function downloadMeeting(record=state.record){if(!record)return;await localQueue;const blob=await meetingAudio(record),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`brevity-meeting-${record.date}.${/mp4/.test(blob.type)?'m4a':'webm'}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export function detachMeeting(){if(state.starting){epoch++;publish({starting:false})}if(state.recording)stopMeeting('interrupted')}
if(typeof window!=='undefined'){
 window.addEventListener('pagehide',detachMeeting)
 window.addEventListener('beforeunload',event=>{if(state.recording||state.saving){event.preventDefault();event.returnValue=''}})
 window.addEventListener('online',()=>{if(state.record)persist()})
}
