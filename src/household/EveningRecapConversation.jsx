import {useEffect,useRef,useState} from 'react'
import {askBrevityAssistant,executeAssistantProposal,createElevenLabsSpeech,getElevenLabsVoices} from '../assistant/assistantApi.js'
import {meetingVoiceReviewText,meetingApprovalCommand} from '../assistant/meetingVoiceReview.js'
import {publishActionCompleted,requestActionReview,ACTION_COMPLETED_EVENT} from '../assistant/actionEvents.js'
import {useMeetingSession,startMeeting,stopMeeting,appendMeetingTurn,openMeetingHistory,meetingSnapshot} from '../meetings/meetingSession.js'
import {useDailyAgenda} from './useDailyAgenda.js'
import {nextDailyPlanDate} from './alignmentDate.js'
import {primeAudio} from '../assistant/voicePlayback.js'
import './EveningRecapConversation.css'
export default function EveningRecapConversation({plan,tomorrowPlan,currentMember,householdChores=[],calendarAppointments=[],readOnly,onCancel,mode='evening'}){
 const isMorning=mode==='morning',meetingName=isMorning?'Chart the Course':'Evening Recap'
 const [connected,setConnected]=useState(false)
 const meeting=useMeetingSession(),today=useDailyAgenda({plan,member:currentMember,scope:'household',chores:householdChores,appointments:calendarAppointments})
 const [status,setStatus]=useState('Ready'),[error,setError]=useState(''),[proposal,setProposal]=useState(null),[receipt,setReceipt]=useState(''),[stage,setStage]=useState(0),[elapsed,setElapsed]=useState(0),[paused,setPaused]=useState(false),[turns,setTurns]=useState([])
 const connection=useRef(null),channel=useRef(null),audio=useRef(null),media=useRef(null),active=useRef(false),busy=useRef(false),pending=useRef(null),review=useRef(null),reviewedAt=useRef(null),followup=useRef(false),transcript=useRef([]),handled=useRef(new Set()),messages=useRef([]),date=nextDailyPlanDate(plan.date)
 const recordingId=useRef(null),mixer=useRef(null),wrapPrompted=useRef(false)
 const playback=useRef({generation:0,url:'',controller:null})
 const stopSpeech=()=>{playback.current.generation++;playback.current.controller?.abort();if(audio.current){audio.current.onended=null;audio.current.pause()}if(playback.current.url){URL.revokeObjectURL(playback.current.url);playback.current.url=''}}
 const playSpeech=async(text,reviewId=null)=>{
  stopSpeech();const generation=playback.current.generation;setStatus('Preparing spoken response')
  try{
   const voiceId=localStorage.getItem('brevity_el_voice_v1')||(await getElevenLabsVoices())[0]?.voice_id
   if(!voiceId)throw Error('Select an ElevenLabs voice in Brevity’s voice settings.')
   if(!active.current||generation!==playback.current.generation)return
   const controller=new AbortController();playback.current.controller=controller
   const blob=await createElevenLabsSpeech({text,voiceId,signal:controller.signal})
   if(!active.current||generation!==playback.current.generation)return
   playback.current.url=URL.createObjectURL(blob);audio.current.src=playback.current.url
   audio.current.onended=()=>{if(generation!==playback.current.generation)return;if(reviewId&&pending.current?.id===reviewId&&review.current?.proposalId===reviewId){review.current.heard=true;reviewedAt.current=Date.now()}setStatus('Listening')}
   audio.current.onerror=()=>{reviewedAt.current=null;setError('Voice playback failed. Read the changes again before approving.')}
   setStatus('Brevity is speaking');await audio.current.play()
  }catch(cause){if(generation!==playback.current.generation)return;reviewedAt.current=null;setError(cause.name==='NotAllowedError'?'Tap Enable speaker to hear Brevity.':cause.message);setStatus('Listening')}
 }
 const send=event=>{if(channel.current?.readyState==='open')channel.current.send(JSON.stringify(event))}
 const speak=instructions=>send({type:'response.create',response:{instructions,tools:[],tool_choice:'none'}})
 const addTurn=(role,text)=>{if(!text)return;transcript.current.push({role,text});setTurns(transcript.current.slice(-12));appendMeetingTurn(role,text)}
 const teardown=()=>{active.current=false;stopSpeech();setConnected(false);channel.current?.close();connection.current?.close();channel.current=null;connection.current=null;media.current?.getTracks().forEach(t=>t.stop());media.current=null;if(audio.current){audio.current.pause();audio.current.srcObject=null}reviewedAt.current=null;if(recordingId.current&&meetingSnapshot().record?.id===recordingId.current)void stopMeeting().finally(()=>mixer.current?.close());else void mixer.current?.close();recordingId.current=null;}
 useEffect(()=>()=>teardown(),[])
 useEffect(()=>{if(active.current&&recordingId.current&&meeting.record?.id===recordingId.current&&!meeting.recording&&!meeting.starting){teardown();setStatus('Stopped · captured recording retained')}},[meeting.recording,meeting.starting])
 useEffect(()=>{if(!meeting.recording)return;const timer=setInterval(()=>setElapsed(Math.floor((Date.now()-Date.parse(meeting.record.startedAt))/1000)),1000);return()=>clearInterval(timer)},[meeting.recording,meeting.record?.startedAt])
 useEffect(()=>{if(!meeting.recording||meeting.record?.id!==recordingId.current)return;if(elapsed>=600){teardown();setStatus('Meeting ended · recording saved');setStage(2)}else if(elapsed>=480&&!wrapPrompted.current){wrapPrompted.current=true;speak('We have two minutes left. Briefly invite the family to finish the meeting and review any changes.')}},[elapsed])
 useEffect(()=>{const completed=e=>{if(e.detail?.proposalId!==pending.current?.id)return;const text=`Saved: ${pending.current.summary}.`;addTurn('Saved result',text);setReceipt(text);pending.current=null;setProposal(null);review.current=null;reviewedAt.current=null};window.addEventListener(ACTION_COMPLETED_EVENT,completed);return()=>window.removeEventListener(ACTION_COMPLETED_EVENT,completed)},[])
 const consult=async request=>{
  if(busy.current)return {message:'A previous request is still processing. Wait for its result before preparing another.'}
  busy.current=true;setStatus('Checking the household plan');setError('');review.current=null;reviewedAt.current=null
  // A correction invalidates the old review immediately, even if the request fails.
  pending.current=null;setProposal(null)
  try{messages.current.push({role:'user',content:`${meetingName}. Today is ${plan.date}; tomorrow is ${date}. This is a shared room, so do not assume the speaker is the signed-in host. Request: ${request}`});const result=await askBrevityAssistant({messages:messages.current,member:currentMember,activeView:'today',activePillar:'household',pageLabel:meetingName});messages.current.push({role:'assistant',content:result.message});pending.current=result.proposal||null;setProposal(pending.current);return {message:result.message,proposalReady:Boolean(result.proposal),notice:'No changes applied. Read the exact proposal before approval.'}}
  catch(cause){setError(cause.message);return {error:cause.message,notice:'Nothing was applied.'}}
  finally{busy.current=false;if(active.current)setStatus('Listening')}
 }
 const readChanges=()=>{const text=meetingVoiceReviewText(pending.current,currentMember);if(!text){if(pending.current)requestActionReview(pending.current);setError(pending.current?'This change requires the existing on-screen review.':'There are no prepared changes to review yet.');return}setStage(2);reviewedAt.current=null;review.current={text,proposalId:pending.current.id,heard:false};addTurn('Brevity',text);void playSpeech(text,pending.current.id)}
 const apply=async phrase=>{
  const selected=pending.current
  if(!selected||!reviewedAt.current||review.current?.proposalId!==selected.id){speak('Please say Read the changes first, and listen to the complete review before approving.');return}
  if(busy.current)return
  busy.current=true;setStatus('Saving confirmed changes');setError('')
  try{const result=await executeAssistantProposal({proposalId:selected.id,confirmed:true,voiceApproval:{mode:'meeting',proposalId:selected.id,phrase,reviewedAt:reviewedAt.current}});publishActionCompleted({proposalId:selected.id,audit:result.audit});pending.current=null;setProposal(null);review.current=null;reviewedAt.current=null;const text=`Saved: ${selected.summary}.`;addTurn('Saved result',text);setReceipt(text);speak(`${text} Report only this confirmed result. Ask whether there are other agreed changes to review.`)}catch(cause){setError(cause.message);reviewedAt.current=null;speak('The changes were not confirmed saved. Please review the error on screen.')}finally{busy.current=false}
 }
 const finish=async()=>{setStage(2);const text=transcript.current.map(x=>`${x.role}: ${x.text}`).join('\n');const result=await consult(`Finish ${meetingName}. ${isMorning?'Review only changes requested for today; do not close the day or create an evening recap.':''} Reconcile the following meeting transcript with current saved records. Extract only final agreed decisions, not tentative ideas, superseded instructions or completed writes. Propose the first remaining cohesive record group and explain any additional groups still needing review. Ask about ambiguities. ${isMorning?'':"Include today's accomplishments and tomorrow preparation in a plan.recap.update when other changes are resolved."} Never mark pending changes completed. Transcript:\n${text}`);if(active.current)speak(`Explain this result briefly and accurately: ${JSON.stringify(result)}`);}
 const start=async()=>{
  if(readOnly||active.current)return
  if(meeting.recording){setError('Finish the active recording before starting this recap.');return}
  setError('');setPaused(false);setElapsed(0);wrapPrompted.current=false;setStatus('Connecting microphone');active.current=true;handled.current.clear();transcript.current=[];messages.current=[];setTurns([])
  try{audio.current=new Audio();primeAudio(audio);const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});if(!active.current){stream.getTracks().forEach(t=>t.stop());return}media.current=stream
   const context=new AudioContext();mixer.current=context;await context.resume();const destination=context.createMediaStreamDestination();context.createMediaStreamSource(stream).connect(destination);const output=context.createMediaElementSource(audio.current);output.connect(context.destination);output.connect(destination);
   await startMeeting({member:currentMember,date:plan.date,kind:'alignment',timing:'today',title:meetingName,audioStream:destination.stream,externalTranscription:true});if(!meetingSnapshot().recording)throw Error(meetingSnapshot().error||'Recording could not start; voice session stopped.');recordingId.current=meetingSnapshot().record.id;if(!active.current){await stopMeeting();await context.close();stream.getTracks().forEach(track=>track.stop());return}
   const pc=new RTCPeerConnection();connection.current=pc;stream.getTracks().forEach(t=>pc.addTrack(t,stream));pc.onconnectionstatechange=()=>{if(['failed','disconnected'].includes(pc.connectionState)){setError('Voice connection interrupted. Your captured meeting remains in Meeting History. Restart when ready.');teardown();setStatus('Disconnected')}}
   const dc=pc.createDataChannel('oai-events');channel.current=dc
   dc.onmessage=async e=>{let event;try{event=JSON.parse(e.data)}catch{return}
    if(event.type==='error'){setError(event.error?.message||'The voice service reported an error.');return}
    if(event.type==='input_audio_buffer.speech_started'){stopSpeech();if(review.current&&!review.current.heard){review.current=null;reviewedAt.current=null;}setStatus('Listening')}
    if(event.type==='conversation.item.input_audio_transcription.completed'){
     if(handled.current.has(event.item_id))return;handled.current.add(event.item_id)
     const text=event.transcript||'';addTurn('Family',text)
     if(meetingApprovalCommand(text)){await apply(text);return}
     // Any correction invalidates approval. Conversational responses are invited
     // only after an address or while answering Brevity's question.
     reviewedAt.current=null
     if(/^(?:hey[, ]+brevity[, ]*)?read (?:the |these )?changes[.!?]*$/i.test(text.trim())){readChanges();return}
     if(/^(?:hey[, ]+brevity[, ]*)?(?:finish|end) (?:the )?(?:evening recap|chart the course|meeting)[.!?]*$/i.test(text.trim())){await finish();return}
     if(/\b(?:hey[, ]+brevity|brevity[, :])/i.test(text)||followup.current){followup.current=false;send({type:'response.create'})}
    }
    if(event.type==='response.output_text.done'){addTurn('Brevity',event.text);followup.current=/\?\s*$/.test(event.text||'');void playSpeech(event.text)}
    if(event.type==='response.function_call_arguments.done'){
     if(handled.current.has(event.call_id))return;handled.current.add(event.call_id);let result
     try{const args=JSON.parse(event.arguments);result=event.name==='consult_brevity'?await consult(String(args.request||'')):{error:'Unsupported operation'}}catch(cause){result={error:cause.message}}
     if(active.current){send({type:'conversation.item.create',item:{type:'function_call_output',call_id:event.call_id,output:JSON.stringify(result)}});send({type:'response.create'})}
    }
   }
   dc.onopen=()=>{setStatus('Listening');send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:`Start ${meetingName} for ${plan.date}. Use consult_brevity to ${isMorning?'brief the family on today’s agreed schedule, focus, owners, appointments and changes; then invite questions':'read today’s accomplishments and tomorrow’s saved schedule; ask just the first unresolved question'}. Keep us within ten minutes.`}]}});send({type:'response.create'})}
   const offer=await pc.createOffer();await pc.setLocalDescription(offer);const response=await fetch('/.netlify/functions/evening-recap-voice',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({sdp:offer.sdp,mode})});if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error||'Could not connect voice.')};if(!active.current)return;await pc.setRemoteDescription({type:'answer',sdp:await response.text()});setConnected(true)
  }catch(cause){teardown();setError(cause.message);setStatus('Ready to retry')}
 }
 const pause=()=>{const value=!paused;setPaused(value);media.current?.getAudioTracks().forEach(t=>{t.enabled=!value});if(value){reviewedAt.current=null;review.current=null;stopSpeech();send({type:'response.cancel'});audio.current?.pause();setStatus('Paused')}else{audio.current?.play().catch(()=>{});setStatus('Listening')}}
 return <div className="evening-recap-conversation"><header><div><span>{meetingName} · {'Recorded conversation · 10 minutes max'}</span><h1>{isMorning?'Remember the plan. Start together.':'Recognize today. Set tomorrow’s course.'}</h1></div><button onClick={()=>{teardown();onCancel()}}>Return to Today</button></header><nav aria-label="Recap stages">{(isMorning?['Today’s course','Questions & changes','Confirm']:['Review today','Plan tomorrow','Confirm']).map((label,i)=><button key={label} aria-current={stage===i?'step':undefined} onClick={()=>setStage(i)}>{i+1}. {label}</button>)}</nav><section className="recap-voice"><strong role="status">{status}{meeting.recording?` · ${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`:''}</strong><p>Speak naturally. Say “Hey, Brevity” to ask a question, “Read the changes” to review, or say “Finish meeting” to reconcile your decisions.</p>{!connected?<button disabled={readOnly||active.current} onClick={start}>{isMorning?'Start Chart the Course':'Start conversation & recording'}</button>:<><button onClick={pause}>{paused?'Resume':'Pause microphone'}</button><button disabled={busy.current} onClick={finish}>Finish {meetingName}</button><button onClick={()=>{teardown();setStatus('Stopped · recording retained')}}>{'Stop recording'}</button></>}<button onClick={()=>audio.current?.play().catch(()=>setError('Speaker could not start. Check your device audio.'))}>Enable speaker</button>{elapsed>=600&&meeting.recording&&<p>Ten minutes reached. Finish the recap to review remaining decisions.</p>}</section>
 {error&&<p className="alignment-error" role="alert">{error}</p>}{meeting.error&&<p role="alert">{meeting.error}</p>}{receipt&&<p className="recap-receipt" role="status">{receipt}</p>}
 {stage===0&&<section><h2>{isMorning?"Today’s agreed commitments":"Today’s recorded progress"}</h2>{isMorning&&today.items.map(x=><p key={`${x.sourceKind}:${x.id}`}>{x.startTime||x.timing||"Time to confirm"} · {x.title} · {x.owner||x.owners?.join(", ")||"Owner to confirm"}</p>)}{today.completed.length?today.completed.map(x=><p key={`${x.sourceKind}:${x.id}`}>✓ {x.title}</p>):<p>No completions are recorded yet. Tell Brevity what you accomplished.</p>}<h3>Needs clarification</h3>{today.pending.slice(0,5).map(x=><p key={`${x.sourceKind}:${x.id}`}>{x.title} · {x.owner||x.owners?.join(', ')||'Owner to confirm'}</p>)}</section>}
 {stage===1&&<section><h2>{isMorning?`Today · ${plan.date}`:`Tomorrow · ${date}`}</h2><p>{(isMorning?plan:tomorrowPlan)?.household?.keyFocus||'Agree on the household focus during the conversation.'}</p><p>Brevity checks saved schedules, appointments, owners, meal plans and preparation before proposing changes.</p></section>}
 {proposal&&<section className="recap-proposal"><h2>Changes awaiting approval</h2><p>{proposal.summary}</p><ol>{proposal.operations.map(op=><li key={op.id}>{op.description}</li>)}</ol><button onClick={readChanges}>Read the changes aloud</button><button onClick={()=>requestActionReview(proposal)}>Review on screen</button></section>}
 <details><summary>Live transcript & meeting history</summary>{turns.map((turn,i)=><p key={i}><strong>{turn.role}:</strong> {turn.text}</p>)}<button onClick={openMeetingHistory}>Meeting History</button></details></div>
}
