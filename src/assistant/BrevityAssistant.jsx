import { READING_EVENT } from './readingText.js'
import SavedTask from './SavedTask.jsx'
import {taskReceiptText} from '../../netlify/lib/task-receipt.mjs'
import {voiceReviewText,voiceApprovalCommand,assertVoiceApproval} from './voiceActionReview.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { conversationRequest, askBrevityAssistant, createElevenLabsSpeech, executeAssistantProposal, getActionMode, getElevenLabsVoices, saveActionPermissions, undoAssistantAction } from './assistantApi.js'
import { assistantStarters } from './assistantStarters.js'
import { ACTION_REVIEW_EVENT, ASSISTANT_REQUEST_EVENT, publishActionCompleted } from './actionEvents.js'
import {retireRecognition,finishRecognition,watchRecognition} from './voiceRecognition.js'
import { startProgress } from './progressTimer.js'
import MessageBody from './MessageBody.jsx'
import { primeAudio } from './voicePlayback.js'
import './BrevityAssistant.css'

const DOMAIN_LABELS = { planning:'Plans & decisions', calendar:'Family Calendar', projects:'Projects', finance:'Finance administration' }

const actionFieldLabel=value=>String(value).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,letter=>letter.toUpperCase())
const actionFieldValue=value=>{
  if(Array.isArray(value))return value.map((item,index)=>item&&typeof item==='object'
    ?`${index+1}. ${Object.entries(item).filter(([,fieldValue])=>fieldValue!==''&&fieldValue!=null).map(([field,fieldValue])=>`${actionFieldLabel(field)}: ${actionFieldValue(fieldValue)}`).join(' · ')}`
    :actionFieldValue(item)).join(' | ')
  if(value&&typeof value==='object')return Object.entries(value).filter(([,fieldValue])=>Array.isArray(fieldValue)?fieldValue.length:fieldValue!==''&&fieldValue!=null).map(([field,fieldValue])=>`${actionFieldLabel(field)}: ${actionFieldValue(fieldValue)}`).join(' · ')
  return typeof value==='boolean'?(value?'Yes':'No'):String(value)
}
function mealCalendarReviewFields(json){try{const c=JSON.parse(json);return [['calendar action',c.kind],['starting date',c.date],...(c.slot?[['meal slot',c.slot]]:[]),...(c.servings?[['people eating',c.servings]]:[]),...(c.mealId?[['library meal',c.mealId]]:[]),...(c.toDate?[['destination date',c.toDate]]:[]),...(c.toSlot?[['destination slot',c.toSlot]]:[]),...(c.offset?[['shift',`${c.offset} days; destination menus replaced`]]:[]),...(c.count?[['days to replace',c.count]]:[]),...(c.recipe?[['meal name',c.recipe.name],['ingredients per person',c.recipe.ingredients],['cooking steps',c.recipe.instructions],['nutrition per person',`${c.recipe.macros.calories} cal · ${c.recipe.macros.proteinGrams}g protein · ${c.recipe.macros.carbohydrateGrams}g carbs · ${c.recipe.macros.fatGrams}g fat`]]:[])]}catch{return []}}
function ActionFields({ operation }) { const nutrition=['nutrition.meal.log','nutrition.meal.update','meal.recipe.update'].includes(operation.type)&&operation.payload?.estimateJson?(()=>{try{return JSON.parse(operation.payload?.estimateJson||'{}')}catch{return{}}})():null;const macros=nutrition?.perServingMacros;const fields=[...(operation.voiceTarget?.title?[['saved item',operation.voiceTarget.title],['current owner',operation.voiceTarget.owner||'Unassigned']]:[]),...(operation.targetDate?[['date',operation.targetDate]]:[]),...(operation.targetId?[['affectedRecord',operation.targetId]]:[]),...Object.entries(operation.payload||{}).filter(([field,value])=>!['date','candidateJson','estimateJson','reconciliation','commandJson'].includes(field)&&value!==''&&value!=null),...(operation.payload?.commandJson?mealCalendarReviewFields(operation.payload.commandJson):[]),...(operation.mealReview?.length?[['menus after this change',operation.mealReview]]:[]),...(operation.payload?.reconciliation?[['bank charge',operation.payload.reconciliation.bankName],['projected date',operation.payload.reconciliation.originalDate],['posting date',operation.payload.reconciliation.postedDate],['original budget',`$${operation.payload.reconciliation.budgetAmount.toFixed(2)}`],['posted amount',`$${operation.payload.reconciliation.actualAmount.toFixed(2)}`],['difference',`$${(operation.payload.reconciliation.actualAmount-operation.payload.reconciliation.budgetAmount).toFixed(2)}`],['scope','Only this occurrence; future payments unchanged']]:[]),...(operation.type==='member.preference.set'&&operation.payload?.value===''?[['preference change','Forget this category of saved preferences']]:[]),...(nutrition?[['ingredients',(nutrition.ingredients||[]).map(item=>item.input||[item.resolvedName,item.amountDescription].filter(Boolean).join(" — "))],['per-food calculation',(nutrition.ingredients||[]).filter(item=>item.macros).map(item=>`${item.input}: ${item.macros.calories} calories · ${item.macros.proteinGrams} g protein · ${item.macros.carbohydrateGrams} g carbs · ${item.macros.fatGrams} g fat${item.packagedPortion?` (consumed ${item.packagedPortion.consumedAmount} ${item.packagedPortion.consumedUnit}; label serving ${item.packagedPortion.labelServingAmount} ${item.packagedPortion.labelServingUnit})`:''}`)],['calculated nutrition',macros?`${macros.calories} calories · ${macros.proteinGrams} g protein · ${macros.carbohydrateGrams} g carbs · ${macros.fatGrams} g fat`:'Unavailable'],...(nutrition.warnings?.length?[['estimate warnings',nutrition.warnings]]:[])]:[])];return fields.length?<dl className="brevity-action-fields">{fields.map(([field,value])=><div key={field}><dt>{actionFieldLabel(field)}</dt><dd>{actionFieldValue(value)}</dd></div>)}</dl>:null }
function ProposalCard({ proposal, onReview }) { return <section className="brevity-action-proposal"><header><span>Action Mode proposal</span><em>{proposal.risk==='strong-confirmation'?'Strong confirmation':'Confirmation required'}</em></header><strong>{proposal.summary}</strong><ol>{proposal.operations.map(operation=><li key={operation.id}><span>{operation.description}</span><small>{DOMAIN_LABELS[operation.domain]||operation.domain}</small></li>)}</ol><button type="button" onClick={()=>onReview(proposal)}>Review changes</button></section> }

function ActionReview({ proposal, busy, onCancel, onApply, onReadReview, voiceReady, playbackBlocked, onResumePlayback }) {
  const [confirmation,setConfirmation]=useState('')
  const [selections,setSelections]=useState(()=>Object.fromEntries(proposal.operations.map(operation=>[operation.id,operation.defaultScope])))
  const strong=proposal.risk==='strong-confirmation'||proposal.operations.some(operation=>(selections[operation.id]||operation.defaultScope)==='this-and-future')
  return <div className="brevity-action-review" role="dialog" aria-modal="true" aria-label="Review proposed Brevity changes"><section><header><div><span>Review before applying</span><h3>{proposal.summary}</h3></div><button type="button" onClick={onCancel} aria-label="Close confirmation"><i className="ti ti-x"/></button></header>{proposal.operations.map(operation=><article key={operation.id}><strong>{operation.description}</strong><ActionFields operation={operation}/>{operation.allowedScopes.length>1&&<label><span>Apply to</span><select value={selections[operation.id]} onChange={event=>setSelections(value=>({...value,[operation.id]:event.target.value}))}><option value="this-item">This item only</option><option value="this-and-future">This and future items</option></select></label>}<small>{operation.risk==='strong-confirmation'?'Higher-impact action':'Record update'} · {DOMAIN_LABELS[operation.domain]}</small></article>)}<div className="brevity-action-warning"><i className="ti ti-shield-check"/><span>Brevity records who made this change, preserves the prior value for Undo, and stops if newer household data exists.</span></div>{strong&&<label className="brevity-action-confirm"><span>Type CONFIRM to authorize this higher-impact change</span><input value={confirmation} onChange={event=>setConfirmation(event.target.value.toUpperCase())} placeholder="CONFIRM"/></label>}<footer>{playbackBlocked&&<button type="button" onClick={onResumePlayback}>Play response</button>}{onReadReview&&<><p role="status">{voiceReady?'Say “Apply this change” to save, or “Cancel this change”.':'Hear the full review before approving this routine item by voice.'}</p><button type="button" disabled={busy} onClick={onReadReview}>Read review for voice approval</button></>}<button type="button" onClick={onCancel}>Cancel</button><button type="button" className="is-primary" disabled={busy||(strong&&confirmation!=='CONFIRM')} onClick={()=>onApply({selections,confirmed:!strong,confirmation})}>{busy?'Applying…':'Apply approved changes'}</button></footer></section></div>
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
  const [messages,setMessages]=useState([]),[conversationVersion,setConversationVersion]=useState(null),[canRestoreConversation,setCanRestoreConversation]=useState(false)
  const memberGeneration=useRef(0)
  const [historyRetry,setHistoryRetry]=useState(0)
  const [feedbackStatus,setFeedbackStatus]=useState('')
  const [attachment,setAttachment]=useState(null)
  const [savedTask,setSavedTask]=useState(null)
  const [voiceReady,setVoiceReady]=useState(false)
  const [playbackBlocked,setPlaybackBlocked]=useState(false)
  const reusableAudioRef=useRef(null)
  const [elapsedSeconds,setElapsedSeconds]=useState(0)
  const [progressAnnouncement,setProgressAnnouncement]=useState('')
  const progressStartRef=useRef(null)
  useEffect(()=>{
    if(!busy){progressStartRef.current=null;setElapsedSeconds(0);setProgressAnnouncement('');return}
    if(progressStartRef.current===null)progressStartRef.current=Date.now()
    if(!open)return
    const progress=startProgress({startedAt:progressStartRef.current},setElapsedSeconds,setProgressAnnouncement)
    return progress.stop
  },[busy,open,currentMember])
  const voiceApprovalRef=useRef(null),voiceFinalTranscriptRef=useRef('')
  const attachPhoto=async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3*1024*1024){setError('Choose a JPEG, PNG or WebP food photo under 3 MB.');return}const reader=new FileReader();reader.onload=()=>{setAttachment({name:file.name,mimeType:file.type,imageBase64:String(reader.result).split(',')[1]});setError('')};reader.onerror=()=>setError('The photo could not be opened.');reader.readAsDataURL(file)}
  const reportFeedback=async outcome=>{try{const response=await fetch('/.netlify/functions/brevity-usage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:`feedback-${crypto.randomUUID()}`,outcome})});if(!response.ok)throw Error();setFeedbackStatus('Feedback recorded. Only the rating is stored.')}catch{setFeedbackStatus('Feedback could not be saved. Please retry.')}}
  const useConversation=data=>{setMessages(data.messages||[]);messagesRef.current=data.messages||[];setConversationVersion(data.version);setCanRestoreConversation(Boolean(data.canRestore))}
  useEffect(()=>{
    const generation=++memberGeneration.current
    progressStartRef.current=null;stopVoiceMode();busyRef.current=false;setBusy(false)
    setMessages([]);setConversationVersion(null);setCanRestoreConversation(false);setReview(null);setDraft('')
    conversationRequest().then(data=>{if(generation!==memberGeneration.current)return;if(data.version===0&&!data.messages?.length){try{data.messages=JSON.parse(localStorage.getItem(historyKey)||'[]')}catch{}}useConversation(data)}).catch(error=>{if(generation===memberGeneration.current)setError(error.message)})
    return()=>{memberGeneration.current++}
  },[historyKey,historyRetry])
  const changeConversation=async action=>{if(busyRef.current)return;stopVoiceMode();setBusy(true);setError('');try{useConversation(await conversationRequest(action,conversationVersion));if(action==='clear')localStorage.removeItem(historyKey)}catch(error){setError(error.message)}finally{setBusy(false)}}

  const voiceRecoveryRef=useRef(0),voiceRestartTimerRef=useRef(null)
  const endRef=useRef(null),inputRef=useRef(null),recognitionRef=useRef(null),audioRef=useRef(null),audioUrlRef=useRef(''),speechRequestRef=useRef(null),playbackPendingRef=useRef(false),voiceModeRef=useRef(false),voiceTimerRef=useRef(null),voiceFinishRef=useRef(null),voiceTranscriptRef=useRef(''),voiceFinalizingRef=useRef(false),voiceGenerationRef=useRef(0),sendRef=useRef(null),startListeningRef=useRef(null),busyRef=useRef(false),openRef=useRef(false),messagesRef=useRef(messages),draftRef=useRef(draft),voiceIdRef=useRef(voiceId)
  busyRef.current=busy;openRef.current=open;messagesRef.current=messages;draftRef.current=draft;voiceIdRef.current=voiceId

  useEffect(()=>{if(open){setTimeout(()=>inputRef.current?.focus(),80);endRef.current?.scrollIntoView({block:'end'})}},[open,messages])
  useEffect(()=>{if(!open)return;getElevenLabsVoices().then(available=>{setVoices(available);const selected=available.some(voice=>voice.voice_id===voiceId)?voiceId:available[0]?.voice_id||'';if(selected){setVoiceId(selected);localStorage.setItem('brevity_el_voice_v1',selected)}}).catch(()=>{})},[open])
  useEffect(()=>{const receive=event=>{const proposal=event.detail?.proposal;if(!proposal?.id)return;stopVoiceMode();setError('');setActionCenter(null);setReview(proposal);setOpen(true)};window.addEventListener(ACTION_REVIEW_EVENT,receive);return()=>window.removeEventListener(ACTION_REVIEW_EVENT,receive)},[])
  useEffect(()=>{const receive=event=>{
    const message=event.detail?.message;if(typeof message!=='string'||!message.trim())return
    setOpen(true);setActionCenter(null);setReview(null)
    if(busyRef.current){setDraft(message);draftRef.current=message;return}
    sendRef.current?.(message)
  };window.addEventListener(ASSISTANT_REQUEST_EVENT,receive);return()=>window.removeEventListener(ASSISTANT_REQUEST_EVENT,receive)},[])
  useEffect(()=>()=>{voiceGenerationRef.current++;voiceModeRef.current=false;clearTimeout(voiceRestartTimerRef.current);clearTimeout(voiceTimerRef.current);voiceFinishRef.current?.();retireRecognition(recognitionRef);speechRequestRef.current?.abort();audioRef.current?.pause();reusableAudioRef.current?.pause();if(audioUrlRef.current)URL.revokeObjectURL(audioUrlRef.current)},[])
  const send=async(text,spoken=false,finalized=false)=>{
    const content=String(text||draftRef.current).trim();if(!content||busyRef.current)return
    if(conversationVersion===null){setError('Your saved conversation is still loading. Use Retry loading conversation if it does not finish.');return}
    const command=spoken?voiceApprovalCommand(content):null
    if(command){
      const pending=voiceApprovalRef.current
      if(command==='cancel'){cancelReview();setDraft('');draftRef.current='';return}
      if(!pending||!finalized){stopVoiceMode();setError('Nothing was applied. Hear the full current review and repeat Apply this change, or use the review button.');return}
      const confirmation={confirmed:true,selections:Object.fromEntries(pending.proposal.operations.map(op=>[op.id,'this-item'])),voiceApproval:{proposalId:pending.proposal.id,phrase:content,reviewedAt:pending.reviewedAt}}
      try{assertVoiceApproval({proposal:pending.proposal,member:currentMember,...confirmation})}catch(error){stopVoiceMode();setError(error.message);return}
      await applyProposal(confirmation,pending.proposal);return
    }

    stopPlayback();clearTimeout(voiceTimerRef.current);voiceFinishRef.current?.();voiceFinishRef.current=null;retireRecognition(recognitionRef);setListening(false);voiceTranscriptRef.current='';voiceFinalTranscriptRef.current='';voiceFinalizingRef.current=false
    const requestGeneration=memberGeneration.current
    let spokenReply=null
    const next=[...messagesRef.current,{role:'user',content}];messagesRef.current=next;setMessages(next);setDraft('');draftRef.current='';busyRef.current=true;setBusy(true);setError('')
    if(voiceModeRef.current)setVoiceStatus('Thinking…')
    try{
      const result=await askBrevityAssistant({messages:next,conversationVersion,image:attachment,member:currentMember,activeView,activePillar,pageLabel})
      if(requestGeneration!==memberGeneration.current)return
      setAttachment(null);if(result.conversation){useConversation(result.conversation);localStorage.removeItem(historyKey)}else{messagesRef.current=[...next,{role:'assistant',content:result.message,proposal:result.proposal||null}];setMessages(messagesRef.current)}
      if(voiceModeRef.current)spokenReply={content:result.message,index:messagesRef.current.length-1,proposal:voiceReviewText(result.proposal,currentMember)?result.proposal:null}
    }catch(requestError){if(requestGeneration===memberGeneration.current){setError(requestError.message||'Brevity Assistant could not answer right now.');if(/changed on another device/.test(requestError.message)){try{useConversation(await conversationRequest());setDraft(content);draftRef.current=content}catch{}}}}
    finally{if(requestGeneration===memberGeneration.current){busyRef.current=false;setBusy(false);if(voiceModeRef.current){if(spokenReply?.proposal)beginVoiceReview(spokenReply.proposal);else if(spokenReply)void playResponse(spokenReply.content,spokenReply.index,true);else startListeningRef.current?.()}}}
  }
  sendRef.current=send
  const openActionCenter=async()=>{stopVoiceMode();setBusy(true);setError('');try{setActionCenter(await getActionMode())}catch(actionError){setError(actionError.message)}finally{setBusy(false)}}
  const applyProposal=async(confirmation,proposal=review)=>{
    if(busyRef.current||!proposal)return
    stopPlayback();clearTimeout(voiceTimerRef.current);retireRecognition(recognitionRef);setListening(false);voiceTranscriptRef.current='';voiceFinalTranscriptRef.current='';setDraft('');draftRef.current=''
    const generation=memberGeneration.current,proposalId=proposal.id
    busyRef.current=true;setBusy(true);setError('');let receipt=''
    try{
      const result=await executeAssistantProposal({proposalId,...confirmation})
      if(generation!==memberGeneration.current)return
      setReview(null)
      const totals=result.nutrition?.totals
      const savedTotals=totals?` Saved totals for ${result.nutrition.date}: ${totals.calories} calories, ${totals.proteinGrams} g protein, ${totals.carbohydrateGrams} g carbohydrates, and ${totals.fatGrams} g fat. These are estimates from confirmed meals only.`:''
      receipt=`Completed: ${result.audit.summary}.${savedTotals} ${taskReceiptText(result.audit.taskLinks,currentMember)} The change is recorded in Action Mode history and remains undoable until a newer edit replaces it.`
      if(result.conversation)useConversation(result.conversation)
      else{messagesRef.current=[...messagesRef.current,{role:'assistant',content:receipt,taskLinks:result.audit.taskLinks||[]}];setMessages(messagesRef.current)}
      try{await onActionCompleted?.();publishActionCompleted({proposalId,audit:result.audit})}catch{setError('The change was saved, but the page could not refresh. Reload to see the updated record.')}
    }catch(actionError){if(generation===memberGeneration.current)setError(actionError.message)}
    finally{if(generation===memberGeneration.current){busyRef.current=false;setBusy(false);if(voiceModeRef.current){if(receipt)void playResponse(receipt,messagesRef.current.length-1,true);else stopVoiceMode()}}}
  }
  const undoAction=async auditId=>{setBusy(true);setError('');try{const result=await undoAssistantAction({auditId,confirmation:'CONFIRM'});if(result.conversation)useConversation(result.conversation);setActionCenter(await getActionMode());await onActionCompleted?.()}catch(actionError){setError(actionError.message)}finally{setBusy(false)}}
  const updatePermissions=async(permissions,expectedVersion,confirmation)=>{setBusy(true);setError('');try{const result=await saveActionPermissions(permissions,expectedVersion,confirmation);if(result.conversation)useConversation(result.conversation);setActionCenter(await getActionMode());await onActionCompleted?.()}catch(actionError){setError(actionError.message)}finally{setBusy(false)}}
  useEffect(()=>{const interrupt=event=>{if(event.detail!=='assistant')stopVoiceMode()};window.addEventListener(READING_EVENT,interrupt);return()=>window.removeEventListener(READING_EVENT,interrupt)},[])
  const stopPlayback=()=>{
    setPlaybackBlocked(false);voiceApprovalRef.current=null;setVoiceReady(false);voiceGenerationRef.current+=1;playbackPendingRef.current=false;speechRequestRef.current?.abort();speechRequestRef.current=null
    if(audioRef.current){audioRef.current.onended=null;audioRef.current.onerror=null;audioRef.current.pause();audioRef.current.removeAttribute?.('src');audioRef.current.load?.();audioRef.current=null}
    if(audioUrlRef.current){URL.revokeObjectURL(audioUrlRef.current);audioUrlRef.current=''}
    setSpeakingMessage(null)
  }
  const stopVoiceMode=()=>{
    voiceModeRef.current=false;setVoiceMode(false);setVoiceStatus('');clearTimeout(voiceTimerRef.current);clearTimeout(voiceRestartTimerRef.current)
    voiceFinishRef.current?.();voiceFinishRef.current=null;retireRecognition(recognitionRef);setListening(false);stopPlayback()
  }
  const submitVoiceTurn=()=>{
    if(!voiceModeRef.current||!voiceFinalizingRef.current)return
    voiceFinalizingRef.current=false;clearTimeout(voiceTimerRef.current)
    const text=voiceTranscriptRef.current.trim(),finalized=text===voiceFinalTranscriptRef.current.trim();voiceTranscriptRef.current='';voiceFinalTranscriptRef.current=''
    if(text)sendRef.current?.(text,true,finalized);else startListeningRef.current?.()
  }
  const startListening=()=>{
    if(!voiceModeRef.current||!openRef.current||recognitionRef.current||audioRef.current||speechRequestRef.current||playbackPendingRef.current||busyRef.current)return
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition
    if(!SpeechRecognition){stopVoiceMode();setError('Voice input is not supported in this browser. Try Chrome, Edge, or Safari.');return}
    const recognition=new SpeechRecognition(),startingTranscript=voiceTranscriptRef.current,startingFinal=voiceFinalTranscriptRef.current;recognition.lang='en-US';recognition.interimResults=true;recognition.continuous=true
    recognitionRef.current=recognition;voiceFinalizingRef.current=false;setListening(false);setVoiceStatus('Starting microphone…')
    const recover=()=>{
      if(recognitionRef.current!==recognition||voiceFinalizingRef.current)return
      retireRecognition(recognitionRef);setListening(false)
      if(voiceRecoveryRef.current++<1){
        setVoiceStatus('Reconnecting microphone…')
        voiceRestartTimerRef.current=setTimeout(()=>startListeningRef.current?.(),300)
      }else{
        stopVoiceMode();setError('The microphone stopped returning speech. Tap Restart microphone to reconnect. Your draft is preserved.')
      }
    }
    const pulse=watchRecognition({recognition,ref:recognitionRef,onStall:recover})
    let capturing=false
    recognition.onstart=()=>{if(recognitionRef.current===recognition&&!capturing)pulse(4000)}
    recognition.onaudiostart=()=>{if(recognitionRef.current===recognition){capturing=true;setListening(true);setVoiceStatus('Listening…');pulse()}}
    recognition.onaudioend=()=>{if(recognitionRef.current===recognition){capturing=false;setListening(false);setVoiceStatus('Reconnecting microphone…');pulse(1000)}}
    recognition.onresult=event=>{
      if(recognitionRef.current!==recognition||voiceFinalizingRef.current)return
      pulse();voiceRecoveryRef.current=0;setListening(true);setVoiceStatus('Listening…')
      let transcript='',finalTranscript='';for(let i=0;i<event.results.length;i+=1){transcript+=event.results[i][0].transcript;if(event.results[i].isFinal)finalTranscript+=event.results[i][0].transcript}
      voiceFinalTranscriptRef.current=`${startingFinal} ${finalTranscript}`.trim()
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
      recognition.cancelWatch?.();recognitionRef.current=null
      setListening(false);setVoiceStatus('Reconnecting microphone…')
      if(voiceFinalizingRef.current)submitVoiceTurn()
      else if(voiceModeRef.current && !busyRef.current)voiceRestartTimerRef.current=setTimeout(()=>startListeningRef.current?.(),voiceTranscriptRef.current?100:500)
      // Mobile browsers may end a recognition session early; keep listening until the silence timer expires.
    }
    recognition.onerror=event=>{
      if(recognitionRef.current!==recognition)return
      if(event.error==='not-allowed'||event.error==='service-not-allowed'){
        stopVoiceMode();setError('Microphone access was denied. Allow microphone access in your browser and try again.')
      }else recover()
    }
    try{recognition.start()}catch{retireRecognition(recognitionRef);setListening(false);setError('The microphone could not start. Tap the microphone to try again.');stopVoiceMode()}
  }
  startListeningRef.current=startListening
  const toggleListening=()=>{
    window.dispatchEvent(new CustomEvent(READING_EVENT,{detail:'assistant'}))
    if(voiceModeRef.current){stopVoiceMode();return}
    voiceRecoveryRef.current=0;voiceModeRef.current=true;setVoiceMode(true);setError('');stopPlayback();primeAudio(reusableAudioRef);voiceTranscriptRef.current='';voiceFinalTranscriptRef.current='';setDraft('');startListening()
  }
  const playResponse=async(content,index,automatic=false,onCompleted)=>{
    window.dispatchEvent(new CustomEvent(READING_EVENT,{detail:'assistant'}))
    stopPlayback();clearTimeout(voiceTimerRef.current);voiceFinishRef.current?.();voiceFinishRef.current=null;retireRecognition(recognitionRef);setListening(false)
    playbackPendingRef.current=true
    const generation=voiceGenerationRef.current;setSpeakingMessage(index);if(voiceModeRef.current)setVoiceStatus('Preparing spoken response…');setError('')
    try{
      let selectedVoiceId=voiceIdRef.current
      if(!selectedVoiceId){const available=await getElevenLabsVoices();if(!available[0])throw new Error('No ElevenLabs voices are available.');setVoices(available);selectedVoiceId=available[0].voice_id;setVoiceId(selectedVoiceId);voiceIdRef.current=selectedVoiceId;localStorage.setItem('brevity_el_voice_v1',selectedVoiceId)}
      if(generation!==voiceGenerationRef.current)return
      const controller=new AbortController();speechRequestRef.current=controller
      const blob=await createElevenLabsSpeech({text:String(content),voiceId:selectedVoiceId,signal:controller.signal})
      if(generation!==voiceGenerationRef.current)return
      speechRequestRef.current=null;playbackPendingRef.current=false;audioUrlRef.current=URL.createObjectURL(blob)
      const audio=reusableAudioRef.current||new Audio();reusableAudioRef.current=audio;audio.src=audioUrlRef.current;audioRef.current=audio
      audio.onended=()=>{if(generation!==voiceGenerationRef.current)return;stopPlayback();onCompleted?.();if(voiceModeRef.current){setVoiceStatus('Starting microphone…');voiceRestartTimerRef.current=setTimeout(()=>startListeningRef.current?.(),300)}}
      audio.onerror=()=>{if(generation!==voiceGenerationRef.current)return;stopPlayback();setError('The spoken response could not be played.');if(voiceModeRef.current)startListeningRef.current?.()}
      if(voiceModeRef.current)setVoiceStatus('Speaking…')
      await audio.play()
    }catch(playbackError){
      if(generation===voiceGenerationRef.current&&playbackError.name!=='AbortError'){
        if(playbackError.name==='NotAllowedError'&&audioRef.current){
          setPlaybackBlocked(true);setVoiceStatus('Tap Play response to enable audio');setError('Your browser needs a tap to play this response.')
        }else{
          stopPlayback();setError(playbackError.message||'ElevenLabs could not read this response.')
          if(automatic)stopVoiceMode()
        }
      }
    }
  }
  const retryPlayback=()=>{
    const audio=audioRef.current,generation=voiceGenerationRef.current
    if(!audio)return
    // Invoke play directly within the tap; do not refetch speech or lose the review callback.
    const attempt=audio.play()
    Promise.resolve(attempt).then(()=>{if(generation===voiceGenerationRef.current){setPlaybackBlocked(false);setError('');setVoiceStatus('Speaking…')}}).catch(()=>{if(generation===voiceGenerationRef.current)setError('Audio is still blocked. Tap Play response to retry.')})
  }
  const beginVoiceReview=proposal=>{
    const text=voiceReviewText(proposal,currentMember)
    if(!text){setError('This change requires on-screen review.');return}
    setReview(proposal);voiceModeRef.current=true;setVoiceMode(true);voiceTranscriptRef.current='';voiceFinalTranscriptRef.current=''
    void playResponse(text,-1,true,()=>{voiceApprovalRef.current={proposal,reviewedAt:Date.now()};setVoiceReady(true)})
  }
  const cancelReview=()=>{stopPlayback();clearTimeout(voiceTimerRef.current);retireRecognition(recognitionRef);voiceTranscriptRef.current='';voiceFinalTranscriptRef.current='';setListening(false);setReview(null);if(voiceModeRef.current)startListeningRef.current?.()}
  const interruptAndSpeak=()=>{
    if(busyRef.current)return
    stopPlayback();voiceTranscriptRef.current='';voiceFinalTranscriptRef.current='';setDraft('');draftRef.current='';setError('');voiceModeRef.current=true;setVoiceMode(true);startListeningRef.current?.()
  }
  const restartMicrophone=()=>{clearTimeout(voiceRestartTimerRef.current);clearTimeout(voiceTimerRef.current);voiceFinishRef.current?.();voiceFinishRef.current=null;retireRecognition(recognitionRef);stopPlayback();voiceRecoveryRef.current=0;voiceFinalizingRef.current=false;voiceTranscriptRef.current=draftRef.current;voiceFinalTranscriptRef.current='';setListening(false);setError('');voiceModeRef.current=true;setVoiceMode(true);startListeningRef.current?.()}
  const togglePlayback=(content,index)=>{if(speakingMessage===index){stopPlayback();if(voiceModeRef.current)startListeningRef.current?.();return}primeAudio(reusableAudioRef);playResponse(content,index)}
  const closeAssistant=()=>{stopVoiceMode();setReview(null);setActionCenter(null);setSavedTask(null);setOpen(false)}
  useEffect(()=>{const close=event=>{if(event.key==='Escape')closeAssistant()};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[])
  return <><button type="button" className={`brevity-assistant-launcher${open?' is-open':''}`} title={open?'Close Brevity Assistant':'Ask Brevity'} aria-label={open?'Close Brevity Assistant':'Open Brevity Assistant'} aria-expanded={open} onClick={()=>open?closeAssistant():setOpen(true)}><i className={`ti ${open?'ti-x':'ti-sparkles'}`} aria-hidden="true"/><span>Ask Brevity</span></button>{open&&<div className="brevity-assistant-backdrop" onClick={closeAssistant} aria-hidden="true"/>}<section className={`brevity-assistant-drawer${open?' is-open':''}`} role="dialog" aria-modal="true" aria-label="Brevity Assistant" aria-hidden={!open}><header className="brevity-assistant-header"><div><p>Brevity intelligence · Action Mode</p><h2>Brevity Assistant</h2><span>{currentMember} · Viewing {pageLabel}</span></div><div className="brevity-assistant-header-actions"><button type="button" title="Action Mode controls" aria-label="Open Action Mode controls" onClick={openActionCenter}><i className="ti ti-shield-check"/></button><button type="button" title="Clear conversation" aria-label="Clear conversation" disabled={busy||conversationVersion===null||!messages.length} onClick={()=>changeConversation('clear')}><i className="ti ti-trash"/></button><button type="button" aria-label="Close Brevity Assistant" onClick={closeAssistant}><i className="ti ti-x"/></button></div></header><div className="brevity-assistant-transcript" aria-live="polite"><p className="brevity-conversation-notice">Your latest 60 messages sync across devices for up to 30 days. Clearing can be undone for 7 days; saved household records are unchanged.</p>{conversationVersion===null&&<button type="button" disabled={busy} onClick={()=>{setError('');setHistoryRetry(value=>value+1)}}>Retry loading conversation</button>}{canRestoreConversation&&!messages.length&&<button type="button" disabled={busy} onClick={()=>changeConversation('restore')}>Restore cleared conversation</button>}{!messages.length&&<div className="brevity-assistant-welcome"><div className="brevity-assistant-mark"><i className="ti ti-sparkles"/></div><h3>How can I help with Brevity?</h3><p>Ask me a question, talk through a decision, or tell me what you need done. I’ll find the relevant information and ask for details I can’t resolve.</p><div className="brevity-assistant-starters">{starters.map(starter=><button type="button" key={starter} onClick={()=>send(starter)}>{starter}</button>)}</div></div>}{messages.map((message,index)=><article key={`${message.role}-${index}`} className={`brevity-assistant-message is-${message.role}`}><div className="brevity-assistant-avatar"><i className={`ti ${message.role==='assistant'?'ti-sparkles':'ti-user'}`}/></div><div><span>{message.role==='assistant'?'Brevity Assistant':currentMember}</span><MessageBody content={message.content}/>{message.role==='assistant'&&message.taskLinks?.map(task=><button type="button" className="brevity-task-link" key={`${task.date}:${task.id}`} onClick={()=>{stopVoiceMode();setSavedTask(task)}} aria-label={`Open task: ${task.title}`}>Open task: {task.title}</button>)}{message.proposal&&<ProposalCard proposal={message.proposal} onReview={proposal=>{stopVoiceMode();setReview(proposal)}}/>} {message.role==='assistant'&&<button type="button" className={`brevity-assistant-read-aloud${speakingMessage===index?' is-speaking':''}`} onClick={()=>togglePlayback(message.content,index)} aria-label={speakingMessage===index?'Stop reading response':'Read response aloud'}><i className={`ti ${speakingMessage===index?'ti-player-stop-filled':'ti-volume'}`}/><span>{speakingMessage===index?'Stop':'Read aloud'}</span></button>}</div></article>)}{busy&&<article className="brevity-assistant-message is-assistant"><div className="brevity-assistant-avatar"><i className="ti ti-sparkles"/></div><div><span>Brevity Assistant</span><div className="brevity-assistant-thinking" aria-hidden="true"><b/><b/><b/></div><p className="brevity-progress" role="status">{progressAnnouncement||'Working on your request'}</p><p className="brevity-progress-elapsed" aria-hidden="true">{elapsedSeconds}s elapsed</p></div></article>}{error&&<div className="brevity-assistant-error" role="alert">{error}</div>}{playbackBlocked&&!review&&<button type="button" className="brevity-play-response" onClick={retryPlayback}>Play response</button>}{messages.length>0&&<div className="brevity-conversation-notice"><span>Was Brevity useful?</span> <button type="button" onClick={()=>reportFeedback('helpful')}>Helpful</button> <button type="button" onClick={()=>reportFeedback('friction')}>Needs improvement</button><p role="status">{feedbackStatus}</p></div>}<div ref={endRef}/></div><footer className="brevity-assistant-composer">{voices.length>0&&<label className="brevity-assistant-voice"><i className="ti ti-wave-sine"/><span>ElevenLabs voice</span><select value={voiceId} onChange={event=>{stopPlayback();setVoiceId(event.target.value);localStorage.setItem('brevity_el_voice_v1',event.target.value)}}>{voices.map(voice=><option key={voice.voice_id} value={voice.voice_id}>{voice.name}</option>)}</select></label>}<label className="brevity-conversation-notice">Attach food, label or menu photo <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={attachPhoto}/></label>{attachment&&<p className="brevity-conversation-notice">Photo ready: {attachment.name} <button type="button" disabled={busy} onClick={()=>setAttachment(null)}>Remove</button></p>}{!busy&&speakingMessage===null&&(voiceMode||error.includes('Restart microphone'))&&<button type="button" className="brevity-restart-microphone" onClick={restartMicrophone}>Restart microphone</button>}<div className="brevity-assistant-input-row"><textarea ref={inputRef} rows="2" value={draft} placeholder={listening?'Listening…':`Ask about ${pageLabel}, household data, or next actions…`} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send()}}}/><div className="brevity-assistant-composer-actions">{speakingMessage!==null&&!busy&&<button type="button" onClick={interruptAndSpeak} aria-label="Interrupt and speak" title="Interrupt and speak"><i className="ti ti-player-skip-forward"/></button>}<button type="button" className={voiceMode?'is-listening':''} onClick={toggleListening} aria-label={voiceMode?'Stop voice conversation':'Start voice conversation'}><i className={`ti ${listening?'ti-player-stop-filled':'ti-microphone'}`}/></button><button type="button" className="is-send" onClick={()=>send()} disabled={busy||!draft.trim()} aria-label="Send message"><i className="ti ti-arrow-up"/></button></div></div><p>{voiceMode?`Voice conversation on · ${voiceStatus||'Starting microphone…'} · 7 seconds of silence sends your question`:'Controlled Action Mode · Every change requires review and is audited'}</p></footer>{review&&<ActionReview key={review.id} proposal={review} busy={busy} onCancel={cancelReview} onApply={applyProposal} voiceReady={voiceReady} playbackBlocked={playbackBlocked} onResumePlayback={retryPlayback} onReadReview={voiceReviewText(review,currentMember)?()=>{primeAudio(reusableAudioRef);beginVoiceReview(review)}:null}/>} {savedTask&&<SavedTask key={`${savedTask.date}:${savedTask.id}`} task={savedTask} onClose={()=>setSavedTask(null)}/>} {actionCenter&&<ActionCenter key={actionCenter.permissionVersion} data={actionCenter} role={role} currentMember={currentMember} busy={busy} onClose={()=>setActionCenter(null)} onUndo={undoAction} onSavePermissions={updatePermissions}/>}</section></>
}
