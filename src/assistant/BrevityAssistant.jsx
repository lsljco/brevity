import { useEffect, useMemo, useRef, useState } from 'react'
import { askBrevityAssistant, createElevenLabsSpeech, executeAssistantProposal, getActionMode, getElevenLabsVoices, saveActionPermissions, undoAssistantAction } from './assistantApi.js'
import { assistantStarters } from './assistantStarters.js'
import { ACTION_REVIEW_EVENT, ASSISTANT_REQUEST_EVENT, publishActionCompleted } from './actionEvents.js'
import {retireRecognition,finishRecognition} from './voiceRecognition.js'
import './BrevityAssistant.css'

const DOMAIN_LABELS = { planning:'Plans & decisions', calendar:'Family Calendar', projects:'Projects', finance:'Finance administration' }

function MessageBody({ content }) { return <div className="brevity-assistant-message-body">{String(content).split('\n').map((line,index)=><p key={index} className={/^\s*[-*•]|^\s*\d+[.)]/.test(line)?'is-list-line':''}>{line||'\u00a0'}</p>)}</div> }
const actionFieldLabel=value=>String(value).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,letter=>letter.toUpperCase())
const actionFieldValue=value=>{
  if(Array.isArray(value))return value.map((item,index)=>item&&typeof item==='object'
    ?`${index+1}. ${Object.entries(item).filter(([,fieldValue])=>fieldValue!==''&&fieldValue!=null).map(([field,fieldValue])=>`${actionFieldLabel(field)}: ${actionFieldValue(fieldValue)}`).join(' · ')}`
    :actionFieldValue(item)).join(' | ')
  if(value&&typeof value==='object')return Object.entries(value).filter(([,fieldValue])=>Array.isArray(fieldValue)?fieldValue.length:fieldValue!==''&&fieldValue!=null).map(([field,fieldValue])=>`${actionFieldLabel(field)}: ${actionFieldValue(fieldValue)}`).join(' · ')
  return typeof value==='boolean'?(value?'Yes':'No'):String(value)
}
function ActionFields({ operation }) { const nutrition=['nutrition.meal.log','nutrition.meal.update','meal.recipe.update'].includes(operation.type)&&operation.payload?.estimateJson?(()=>{try{return JSON.parse(operation.payload?.estimateJson||'{}')}catch{return{}}})():null;const macros=nutrition?.perServingMacros;const fields=[...(operation.targetDate?[['date',operation.targetDate]]:[]),...(operation.targetId?[['affectedRecord',operation.targetId]]:[]),...Object.entries(operation.payload||{}).filter(([field,value])=>!['date','candidateJson','estimateJson'].includes(field)&&value!==''&&value!=null),...(nutrition?[['ingredients',(nutrition.ingredients||[]).map(item=>item.input||[item.resolvedName,item.amountDescription].filter(Boolean).join(" — "))],['calculated nutrition',macros?`${macros.calories} calories · ${macros.proteinGrams} g protein · ${macros.carbohydrateGrams} g carbs · ${macros.fatGrams} g fat`:'Unavailable'],...(nutrition.warnings?.length?[['estimate warnings',nutrition.warnings]]:[])]:[])];return fields.length?<dl className="brevity-action-fields">{fields.map(([field,value])=><div key={field}><dt>{actionFieldLabel(field)}</dt><dd>{actionFieldValue(value)}</dd></div>)}</dl>:null }
function ProposalCard({ proposal, onReview }) { return <section className="brevity-action-proposal"><header><span>Action Mode proposal</span><em>{proposal.risk==='strong-confirmation'?'Strong confirmation':'Confirmation required'}</em></header><strong>{proposal.summary}</strong><ol>{proposal.operations.map(operation=><li key={operation.id}><span>{operation.description}</span><small>{DOMAIN_LABELS[operation.domain]||operation.domain}</small></li>)}</ol><button type="button" onClick={()=>onReview(proposal)}>Review changes</button></section> }

function ActionReview({ proposal, busy, onCancel, onApply }) {
  const [confirmation,setConfirmation]=useState('')
  const [selections,setSelections]=useState(()=>Object.fromEntries(proposal.operations.map(operation=>[operation.id,operation.defaultScope])))
  const strong=proposal.risk==='strong-confirmation'||proposal.operations.some(operation=>(selections[operation.id]||operation.defaultScope)==='this-and-future')
  return <div className="brevity-action-review" role="dialog" aria-modal="true" aria-label="Review proposed Brevity changes"><section><header><div><span>Review before applying</span><h3>{proposal.summary}</h3></div><button type="button" onClick={onCancel} aria-label="Close confirmation"><i className="ti ti-x"/></button></header>{proposal.operations.map(operation=><article key={operation.id}><strong>{operation.description}</strong><ActionFields operation={operation}/>{operation.allowedScopes.length>1&&<label><span>Apply to</span><select value={selections[operation.id]} onChange={event=>setSelections(value=>({...value,[operation.id]:event.target.value}))}><option value="this-item">This item only</option><option value="this-and-future">This and future items</option></select></label>}<small>{operation.risk==='strong-confirmation'?'Higher-impact action':'Record update'} · {DOMAIN_LABELS[operation.domain]}</small></article>)}<div className="brevity-action-warning"><i className="ti ti-shield-check"/><span>Brevity records who made this change, preserves the prior value for Undo, and stops if newer household data exists.</span></div>{strong&&<label className="brevity-action-confirm"><span>Type CONFIRM to authorize this higher-impact change</span><input value={confirmation} onChange={event=>setConfirmation(event.target.value.toUpperCase())} placeholder="CONFIRM"/></label>}<footer><button type="button" onClick={onCancel}>Cancel</button><button type="button" className="is-primary" disabled={busy||(strong&&confirmation!=='CONFIRM')} onClick={()=>onApply({selections,confirmed:!strong,confirmation})}>{busy?'Applying…':'Apply approved changes'}</button></footer></section></div>
}
const auditTarget=operation=>[operation.targetDate&&`Date ${operation.targetDate}`,operation.targetId&&`Record ${operation.targetId}`].filter(Boolean).join(' · ')
const permissionChanges=(before,after)=>Object.entries(after||{}).flatMap(([member,domains])=>member==='Larry'||!domains||typeof domains!=='object'?[]:Object.keys(DOMAIN_LABELS).filter(domain=>Boolean(before?.[member]?.[domain])!==Boolean(domains[domain])).map(domain=>({member,domain,enabled:Boolean(domains[domain])})))
function ActionCenter({ data, role, currentMember, busy, onClose, onUndo, onSavePermissions }) {
  const [permissions,setPermissions]=useState(data.permissions||{}),[tab,setTab]=useState('history'),[confirmations,setConfirmations]=useState({}),[permissionConfirmation,setPermissionConfirmation]=useState('')
  const changes=permissionChanges(data.permissions,permissions)
  useEffect(()=>{setPermissions(data.permissions||{});setPermissionConfirmation('')},[data.permissions,data.permissionVersion])
  return <div className="brevity-action-center" role="dialog" aria-modal="true" aria-label="Action Mode controls and audit history"><header><div><span>Action Mode</span><h3>Controls & audit history</h3></div><button type="button" onClick={onClose} aria-label="Close Action Mode controls"><i className="ti ti-x"/></button></header><nav><button className={tab==='history'?'active':''} onClick={()=>setTab('history')}>Audit history</button><button className={tab==='permissions'?'active':''} onClick={()=>setTab('permissions')}>Member permissions</button></nav>{tab==='history'?<div className="brevity-action-history">{!data.history?.length&&<p>No Action Mode changes have been completed yet.</p>}{data.history?.map(item=><article key={item.id}><div><strong>{item.summary}</strong><span>{item.actor} · {new Date(item.occurredAt).toLocaleString()}{item.undoneAt?` · Undone by ${item.undoneBy}`:''}</span>{item.operations?.length>0&&<ul>{item.operations.map(operation=><li key={operation.id}>{operation.description}{operation.selectedScope==='this-and-future'?' · This and future items':''}{auditTarget(operation)?` · ${auditTarget(operation)}`:''}</li>)}</ul>}</div>{item.undoAvailable&&!item.undoneAt&&<div><input aria-label={`Type CONFIRM to undo ${item.summary}`} value={confirmations[item.id]||''} onChange={event=>setConfirmations(value=>({...value,[item.id]:event.target.value.toUpperCase()}))} placeholder="CONFIRM"/><button disabled={busy||confirmations[item.id]!=='CONFIRM'} onClick={()=>onUndo(item.id)}>Undo</button></div>}</article>)}</div>:<div className="brevity-action-permissions">{Object.entries(permissions).filter(([,domains])=>domains&&typeof domains==='object'&&!Array.isArray(domains)&&Object.keys(DOMAIN_LABELS).every(domain=>domain in domains)).map(([member,domains])=><article key={member}><strong>{member}{member===currentMember?' · Signed in':''}</strong><div>{Object.entries(DOMAIN_LABELS).map(([domain,label])=><label key={domain}><input type="checkbox" checked={Boolean(domains[domain])} disabled={role!=='admin'||member==='Larry'} onChange={event=>setPermissions(value=>({...value,[member]:{...value[member],[domain]:event.target.checked}}))}/><span>{label}</span></label>)}</div></article>)}{role==='admin'?<>{changes.length>0&&<div className="brevity-permission-review" role="status"><strong>Review {changes.length} pending {changes.length===1?'change':'changes'}</strong><ul>{changes.map(change=><li key={`${change.member}-${change.domain}`}>{change.enabled?'Enable':'Disable'} {DOMAIN_LABELS[change.domain]} for {change.member}</li>)}</ul></div>}<label className="brevity-permission-confirm"><span>Review the changes, then type CONFIRM</span><input aria-label="Type CONFIRM to save member permissions" value={permissionConfirmation} onChange={event=>setPermissionConfirmation(event.target.value.toUpperCase())} placeholder="CONFIRM" disabled={!changes.length}/></label><button type="button" className="is-primary" disabled={busy||!changes.length||permissionConfirmation!=='CONFIRM'||!Number.isInteger(data.permissionVersion)} onClick={()=>onSavePermissions(permissions,data.permissionVersion,permissionConfirmation)}>Save reviewed permissions</button></>:<p>Only the household administrator can change member permissions.</p>}</div>}</div>
}
export default function BrevityAssistant({ currentMember, role='member', activeView, activePillar, pageLabel, onActionCompleted }) {
  const historyKey=useMemo(()=>`brevity_assistant_history_v1_${String(currentMember).toLowerCase().replace(/\W+/g,'-')}`,[currentMember])
  const starters=useMemo(()=>assistantStarters({activeView,activePillar}),[activeView,activePillar])
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[listening,setListening]=useState(false),[voiceMode,setVoiceMode]=useState(false),[voiceStatus,setVoiceStatus]=useState(''),[speakingMessage,setSpeakingMessage]=useState(null),[voices,setVoices]=useState([]),[voiceId,setVoiceId]=useState(()=>localStorage.getItem('brevity_el_voice_v1')||''),[review,setReview]=useState(null),[actionCenter,setActionCenter]=useState(null)
  const [messages,setMessages]=useState(()=>{try{return JSON.parse(localStorage.getItem(historyKey)||'[]')}catch{return[]}})
  const endRef=useRef(null),inputRef=useRef(null),recognitionRef=useRef(null),audioRef=useRef(null),audioUrlRef=useRef(''),speechRequestRef=useRef(null),voiceModeRef=useRef(false),voiceTimerRef=useRef(null),voiceFinishRef=useRef(null),voiceTranscriptRef=useRef(''),voiceFinalizingRef=useRef(false),voiceGenerationRef=useRef(0),sendRef=useRef(null),startListeningRef=useRef(null),busyRef=useRef(false),openRef=useRef(false),messagesRef=useRef(messages),draftRef=useRef(draft),voiceIdRef=useRef(voiceId)
  busyRef.current=busy;openRef.current=open;messagesRef.current=messages;draftRef.current=draft;voiceIdRef.current=voiceId
  useEffect(()=>{try{localStorage.setItem(historyKey,JSON.stringify(messages.slice(-30)))}catch{}},[historyKey,messages])
  useEffect(()=>{if(open){setTimeout(()=>inputRef.current?.focus(),80);endRef.current?.scrollIntoView({block:'end'})}},[open,messages])
  useEffect(()=>{if(!open)return;getElevenLabsVoices().then(available=>{setVoices(available);const selected=available.some(voice=>voice.voice_id===voiceId)?voiceId:available[0]?.voice_id||'';if(selected){setVoiceId(selected);localStorage.setItem('brevity_el_voice_v1',selected)}}).catch(()=>{})},[open])
  useEffect(()=>{const receive=event=>{const proposal=event.detail?.proposal;if(!proposal?.id)return;setError('');setActionCenter(null);setReview(proposal);setOpen(true)};window.addEventListener(ACTION_REVIEW_EVENT,receive);return()=>window.removeEventListener(ACTION_REVIEW_EVENT,receive)},[])
  useEffect(()=>{const receive=event=>{
    const message=event.detail?.message;if(typeof message!=='string'||!message.trim())return
    setOpen(true);setActionCenter(null);setReview(null)
    if(busyRef.current){setDraft(message);draftRef.current=message;return}
    sendRef.current?.(message)
  };window.addEventListener(ASSISTANT_REQUEST_EVENT,receive);return()=>window.removeEventListener(ASSISTANT_REQUEST_EVENT,receive)},[])
  useEffect(()=>()=>{voiceModeRef.current=false;clearTimeout(voiceTimerRef.current);voiceFinishRef.current?.();retireRecognition(recognitionRef);speechRequestRef.current?.abort();audioRef.current?.pause();if(audioUrlRef.current)URL.revokeObjectURL(audioUrlRef.current)},[])
  const send=async(text,spoken=false)=>{
    const content=String(text||draftRef.current).trim();if(!content||busyRef.current)return
    clearTimeout(voiceTimerRef.current);voiceFinishRef.current?.();voiceFinishRef.current=null;retireRecognition(recognitionRef);voiceTranscriptRef.current='';voiceFinalizingRef.current=false
    const next=[...messagesRef.current,{role:'user',content}];messagesRef.current=next;setMessages(next);setDraft('');draftRef.current='';busyRef.current=true;setBusy(true);setError('')
    if(voiceModeRef.current)setVoiceStatus('Thinking…')
    try{
      const result=await askBrevityAssistant({messages:next,member:currentMember,activeView,activePillar,pageLabel})
      messagesRef.current=[...next,{role:'assistant',content:result.message,proposal:result.proposal||null}];setMessages(messagesRef.current)
      if(voiceModeRef.current)await playResponse(result.message,messagesRef.current.length-1,true)
    }catch(requestError){setError(requestError.message||'Brevity Assistant could not answer right now.')}
    finally{busyRef.current=false;setBusy(false);if(voiceModeRef.current)startListeningRef.current?.()}
  }
  sendRef.current=send
  const openActionCenter=async()=>{setBusy(true);setError('');try{setActionCenter(await getActionMode())}catch(actionError){setError(actionError.message)}finally{setBusy(false)}}
  const applyProposal=async confirmation=>{const proposalId=review.id;setBusy(true);setError('');try{const result=await executeAssistantProposal({proposalId,...confirmation});setReview(null);const totals=result.nutrition?.totals;const savedTotals=totals?` Saved totals for ${result.nutrition.date}: ${totals.calories} calories, ${totals.proteinGrams} g protein, ${totals.carbohydrateGrams} g carbohydrates, and ${totals.fatGrams} g fat. These are estimates from confirmed meals only.`:'';setMessages(existing=>[...existing,{role:'assistant',content:`Completed: ${result.audit.summary}.${savedTotals} The change is recorded in Action Mode history and remains undoable until a newer edit replaces it.`}]);await onActionCompleted?.();publishActionCompleted({proposalId,audit:result.audit})}catch(actionError){setError(actionError.message)}finally{setBusy(false)}}
  const undoAction=async auditId=>{setBusy(true);setError('');try{await undoAssistantAction({auditId,confirmation:'CONFIRM'});setActionCenter(await getActionMode());await onActionCompleted?.()}catch(actionError){setError(actionError.message)}finally{setBusy(false)}}
  const updatePermissions=async(permissions,expectedVersion,confirmation)=>{setBusy(true);setError('');try{await saveActionPermissions(permissions,expectedVersion,confirmation);setActionCenter(await getActionMode());await onActionCompleted?.()}catch(actionError){setError(actionError.message)}finally{setBusy(false)}}
  const stopPlayback=()=>{
    voiceGenerationRef.current+=1;speechRequestRef.current?.abort();speechRequestRef.current=null
    if(audioRef.current){audioRef.current.onended=null;audioRef.current.onerror=null;audioRef.current.pause();audioRef.current=null}
    if(audioUrlRef.current){URL.revokeObjectURL(audioUrlRef.current);audioUrlRef.current=''}
    setSpeakingMessage(null)
  }
  const stopVoiceMode=()=>{
    voiceModeRef.current=false;setVoiceMode(false);setVoiceStatus('');clearTimeout(voiceTimerRef.current)
    voiceFinishRef.current?.();voiceFinishRef.current=null;retireRecognition(recognitionRef);setListening(false);stopPlayback()
  }
  const submitVoiceTurn=()=>{
    if(!voiceModeRef.current||!voiceFinalizingRef.current)return
    voiceFinalizingRef.current=false;clearTimeout(voiceTimerRef.current)
    const text=voiceTranscriptRef.current.trim();voiceTranscriptRef.current=''
    if(text)sendRef.current?.(text,true);else startListeningRef.current?.()
  }
  const startListening=()=>{
    if(!voiceModeRef.current||!openRef.current||recognitionRef.current||audioRef.current||speechRequestRef.current||busyRef.current)return
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition
    if(!SpeechRecognition){stopVoiceMode();setError('Voice input is not supported in this browser. Try Chrome, Edge, or Safari.');return}
    const recognition=new SpeechRecognition(),startingTranscript=voiceTranscriptRef.current;recognition.lang='en-US';recognition.interimResults=true;recognition.continuous=true
    recognitionRef.current=recognition;voiceFinalizingRef.current=false;setVoiceStatus('Listening…')
    recognition.onstart=()=>{if(recognitionRef.current===recognition)setListening(true)}
    recognition.onresult=event=>{
      if(recognitionRef.current!==recognition||voiceFinalizingRef.current)return
      let transcript='';for(let i=0;i<event.results.length;i+=1)transcript+=event.results[i][0].transcript
      voiceTranscriptRef.current=`${startingTranscript} ${transcript}`.trim();setDraft(voiceTranscriptRef.current)
      clearTimeout(voiceTimerRef.current)
      if(voiceTranscriptRef.current)voiceTimerRef.current=setTimeout(()=>{
        if(!voiceModeRef.current)return
        voiceFinalizingRef.current=true;setVoiceStatus('Sending…')
        if(recognitionRef.current===recognition)voiceFinishRef.current=finishRecognition({recognition,ref:recognitionRef,onFinish:()=>{setListening(false);submitVoiceTurn()}});else submitVoiceTurn()
      },7000)
    }
    recognition.onend=()=>{
      if(recognitionRef.current!==recognition)return
      recognitionRef.current=null
      setListening(false)
      if(voiceFinalizingRef.current)submitVoiceTurn()
      else if(voiceModeRef.current && !busyRef.current)setTimeout(()=>startListeningRef.current?.(),voiceTranscriptRef.current?100:500)
      // Mobile browsers may end a recognition session early; keep listening until the silence timer expires.
    }
    recognition.onerror=event=>{
      if(recognitionRef.current!==recognition)return
      if(event.error==='not-allowed'||event.error==='service-not-allowed'){
        stopVoiceMode();setError('Microphone access was denied. Allow microphone access in your browser and try again.')
      }else if(event.error!=='aborted'&&event.error!=='no-speech')setError('I could not hear that clearly. Please try speaking again.')
    }
    try{recognition.start()}catch{recognitionRef.current=null;setListening(false);setError('The microphone could not start. Tap the microphone to try again.');stopVoiceMode()}
  }
  startListeningRef.current=startListening
  const toggleListening=()=>{
    if(voiceModeRef.current){stopVoiceMode();return}
    voiceModeRef.current=true;setVoiceMode(true);setError('');stopPlayback();voiceTranscriptRef.current='';setDraft('');startListening()
  }
  const playResponse=async(content,index,automatic=false)=>{
    stopPlayback();clearTimeout(voiceTimerRef.current);voiceFinishRef.current?.();voiceFinishRef.current=null;retireRecognition(recognitionRef);setListening(false)
    const generation=voiceGenerationRef.current;setSpeakingMessage(index);if(voiceModeRef.current)setVoiceStatus('Preparing spoken response…');setError('')
    try{
      let selectedVoiceId=voiceIdRef.current
      if(!selectedVoiceId){const available=await getElevenLabsVoices();if(!available[0])throw new Error('No ElevenLabs voices are available.');setVoices(available);selectedVoiceId=available[0].voice_id;setVoiceId(selectedVoiceId);voiceIdRef.current=selectedVoiceId;localStorage.setItem('brevity_el_voice_v1',selectedVoiceId)}
      if(generation!==voiceGenerationRef.current)return
      const controller=new AbortController();speechRequestRef.current=controller
      const blob=await createElevenLabsSpeech({text:String(content),voiceId:selectedVoiceId,signal:controller.signal})
      if(generation!==voiceGenerationRef.current)return
      speechRequestRef.current=null;audioUrlRef.current=URL.createObjectURL(blob)
      const audio=new Audio(audioUrlRef.current);audioRef.current=audio
      audio.onended=()=>{if(generation!==voiceGenerationRef.current)return;stopPlayback();if(voiceModeRef.current)startListeningRef.current?.()}
      audio.onerror=()=>{if(generation!==voiceGenerationRef.current)return;stopPlayback();setError('The spoken response could not be played.');if(voiceModeRef.current)startListeningRef.current?.()}
      if(voiceModeRef.current)setVoiceStatus('Speaking…')
      await audio.play()
    }catch(playbackError){
      if(generation===voiceGenerationRef.current&&playbackError.name!=='AbortError'){
        stopPlayback();setError(automatic?'Audio playback was blocked. Tap the microphone to continue voice conversation.':playbackError.message||'ElevenLabs could not read this response.')
        if(automatic)stopVoiceMode()
      }
    }
  }
  const togglePlayback=(content,index)=>{if(speakingMessage===index){stopPlayback();if(voiceModeRef.current)startListeningRef.current?.();return}playResponse(content,index)}
  const closeAssistant=()=>{stopVoiceMode();setReview(null);setActionCenter(null);setOpen(false)}
  useEffect(()=>{const close=event=>{if(event.key==='Escape')closeAssistant()};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[])
  return <><button type="button" className={`brevity-assistant-launcher${open?' is-open':''}`} title={open?'Close Brevity Assistant':'Ask Brevity'} aria-label={open?'Close Brevity Assistant':'Open Brevity Assistant'} aria-expanded={open} onClick={()=>open?closeAssistant():setOpen(true)}><i className={`ti ${open?'ti-x':'ti-sparkles'}`} aria-hidden="true"/><span>Ask Brevity</span></button>{open&&<div className="brevity-assistant-backdrop" onClick={closeAssistant} aria-hidden="true"/>}<section className={`brevity-assistant-drawer${open?' is-open':''}`} role="dialog" aria-modal="true" aria-label="Brevity Assistant" aria-hidden={!open}><header className="brevity-assistant-header"><div><p>Brevity intelligence · Action Mode</p><h2>Brevity Assistant</h2><span>{currentMember} · Viewing {pageLabel}</span></div><div className="brevity-assistant-header-actions"><button type="button" title="Action Mode controls" aria-label="Open Action Mode controls" onClick={openActionCenter}><i className="ti ti-shield-check"/></button><button type="button" title="Clear conversation" aria-label="Clear conversation" onClick={()=>{stopVoiceMode();setMessages([]);messagesRef.current=[];setError('')}}><i className="ti ti-trash"/></button><button type="button" aria-label="Close Brevity Assistant" onClick={closeAssistant}><i className="ti ti-x"/></button></div></header><div className="brevity-assistant-transcript" aria-live="polite">{!messages.length&&<div className="brevity-assistant-welcome"><div className="brevity-assistant-mark"><i className="ti ti-sparkles"/></div><h3>How can I help with Brevity?</h3><p>Ask me a question, talk through a decision, or tell me what you need done. I’ll find the relevant information and ask for details I can’t resolve.</p><div className="brevity-assistant-starters">{starters.map(starter=><button type="button" key={starter} onClick={()=>send(starter)}>{starter}</button>)}</div></div>}{messages.map((message,index)=><article key={`${message.role}-${index}`} className={`brevity-assistant-message is-${message.role}`}><div className="brevity-assistant-avatar"><i className={`ti ${message.role==='assistant'?'ti-sparkles':'ti-user'}`}/></div><div><span>{message.role==='assistant'?'Brevity Assistant':currentMember}</span><MessageBody content={message.content}/>{message.proposal&&<ProposalCard proposal={message.proposal} onReview={setReview}/>} {message.role==='assistant'&&<button type="button" className={`brevity-assistant-read-aloud${speakingMessage===index?' is-speaking':''}`} onClick={()=>togglePlayback(message.content,index)} aria-label={speakingMessage===index?'Stop reading response':'Read response aloud'}><i className={`ti ${speakingMessage===index?'ti-player-stop-filled':'ti-volume'}`}/><span>{speakingMessage===index?'Stop':'Read aloud'}</span></button>}</div></article>)}{busy&&<article className="brevity-assistant-message is-assistant"><div className="brevity-assistant-avatar"><i className="ti ti-sparkles"/></div><div><span>Brevity Assistant</span><div className="brevity-assistant-thinking"><b/><b/><b/></div></div></article>}{error&&<div className="brevity-assistant-error" role="alert">{error}</div>}<div ref={endRef}/></div><footer className="brevity-assistant-composer">{voices.length>0&&<label className="brevity-assistant-voice"><i className="ti ti-wave-sine"/><span>ElevenLabs voice</span><select value={voiceId} onChange={event=>{stopPlayback();setVoiceId(event.target.value);localStorage.setItem('brevity_el_voice_v1',event.target.value)}}>{voices.map(voice=><option key={voice.voice_id} value={voice.voice_id}>{voice.name}</option>)}</select></label>}<textarea ref={inputRef} rows="2" value={draft} placeholder={listening?'Listening…':`Ask about ${pageLabel}, household data, or next actions…`} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send()}}}/><div className="brevity-assistant-composer-actions"><button type="button" className={voiceMode?'is-listening':''} onClick={toggleListening} aria-label={voiceMode?'Stop voice conversation':'Start voice conversation'}><i className={`ti ${listening?'ti-player-stop-filled':'ti-microphone'}`}/></button><button type="button" className="is-send" onClick={()=>send()} disabled={busy||!draft.trim()} aria-label="Send message"><i className="ti ti-arrow-up"/></button></div><p>{voiceMode?`Voice conversation on · ${voiceStatus||'Listening…'} · 7 seconds of silence sends your question`:'Controlled Action Mode · Every change requires review and is audited'}</p></footer>{review&&<ActionReview proposal={review} busy={busy} onCancel={()=>setReview(null)} onApply={applyProposal}/>} {actionCenter&&<ActionCenter key={actionCenter.permissionVersion} data={actionCenter} role={role} currentMember={currentMember} busy={busy} onClose={()=>setActionCenter(null)} onUndo={undoAction} onSavePermissions={updatePermissions}/>}</section></>
}
