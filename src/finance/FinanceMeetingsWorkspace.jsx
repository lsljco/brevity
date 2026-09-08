import { useEffect, useMemo, useRef, useState } from 'react'
import { getHouseholdDateKey } from './financeTime.js'
import { meetingBalanceQualification, meetingCoverageTone, meetingTransactionQualification, normalizeMeetingSourceStatus } from './financeMeetingTruth.js'
import { analyzeMeetingTranscript, transcribeMeetingAudio } from './meetingApi.js'
import MetricDrilldown from './MetricDrilldown.jsx'
import { canonicalMeetingAction, canonicalMeetingCorrection, canonicalMeetingHistory, canonicalMeetingNameText } from './meetingNames.js'
import { ACTION_COMPLETED_EVENT } from '../assistant/actionEvents.js'
import { HOUSEHOLD_MEMBERS } from '../household/dailyPlan.js'
import { SHARED_STATE_EVENT } from '../household/sharedState.js'
import {
  meetingActionCreateOperation,
  meetingActionOperation,
  meetingCorrectionCreateOperation,
  meetingCorrectionOperation,
  meetingHistoryOperation,
  meetingSessionCreateOperation,
  meetingWorkspaceOperation,
  requestMeetingActionReview,
} from './meetingActionReview.js'
import './FinanceMeetings.css'

const STORAGE_KEY='brevity_finance_meetings_v1'
const CADENCES=['daily','weekly','monthly','quarterly','yearly']
const LABELS={daily:'Daily',weekly:'Weekly',monthly:'Monthly',quarterly:'Quarterly',yearly:'Yearly'}
const JOBS={daily:'Protect today’s cash and execute today’s commitments.',weekly:'Resolve exceptions and coordinate the next two weeks.',monthly:'Measure performance and update the household plan.',quarterly:'Reassess trajectory and reallocate priorities.',yearly:'Close the year and set the next year’s financial direction.'}
const SOURCE_STATES=['Bank Verified','Forecast','User Confirmed','Proposed']
const AUTO_KEYS=['currentMonthlyNet','actualMonthlyNet','projectedMonthlyNet','operatingBalance','operatingAvailable','todayInflows','todayObligations','approvedDiscretionary','weekInflows','weekObligations','monthForecast']

const freshSnapshot=()=>({goalMonthlyNet:50000,currentMonthlyNet:'',actualMonthlyNet:'',projectedMonthlyNet:'',operatingBalance:'',operatingAvailable:'',todayInflows:'',todayObligations:'',approvedDiscretionary:'',weekInflows:'',weekObligations:'',monthForecast:'',monthStatus:'yellow',expenseFocus:'Gym · Phone · Cable · Subscriptions · Food waste'})
const fresh=()=>({activeCadence:'weekly',meetings:[],corrections:[],openActions:[],cadenceNotes:{},snapshot:freshSnapshot(),autoSnapshot:{}})
const readStore=()=>{try{const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return{...fresh(),...parsed,snapshot:{...freshSnapshot(),...(parsed.snapshot||{})}}}catch{return fresh()}}
const money=value=>value===''||value==null||Number.isNaN(Number(value))?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value))
const meetingDate=()=>getHouseholdDateKey()

function Metric({label,value,tone='neutral',note,onClick}){
  const Tag=onClick?'button':'div'
  return <Tag type={onClick?'button':undefined} className={`fm-metric fm-metric--${tone}${onClick?' fm-metric--clickable':''}`} onClick={onClick}><span>{label}</span><strong>{value}</strong>{note&&<small>{note}</small>}{onClick&&<i className="ti ti-chevron-right fm-metric-chevron"/>}</Tag>
}

function ReviewableText({label,value,onReview,readOnly=false,rows=4,placeholder=''}){
  const[draft,setDraft]=useState(value||''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{setDraft(value||'');setError('')},[value])
  const dirty=draft!==(value||'')
  const review=async()=>{setBusy(true);setError('');try{await onReview(draft)}catch(reviewError){setError(reviewError.message||'Brevity could not prepare this note for review.')}finally{setBusy(false)}}
  return <div className="fm-reviewed-text"><textarea aria-label={label} rows={rows} value={draft} onChange={event=>setDraft(event.target.value)} readOnly={readOnly} placeholder={placeholder}/>{error&&<small className="fm-edit-error" role="alert">{error}</small>}{!readOnly&&dirty&&<div><button type="button" onClick={()=>setDraft(value||'')} disabled={busy}>Discard</button><button type="button" className="fm-save" onClick={review} disabled={busy}>{busy?'Preparing review…':'Review note'}</button></div>}</div>
}
function Action({item,onToggle,onSave,readOnly=false}){
  const display=canonicalMeetingAction(item),needsNameRepair=JSON.stringify(display)!==JSON.stringify(item)
  const[editing,setEditing]=useState(false),[draft,setDraft]=useState(display),[saving,setSaving]=useState(false),[error,setError]=useState('')
  useEffect(()=>setDraft(canonicalMeetingAction(item)),[item])
  const review=async()=>{setSaving(true);setError('');try{await onSave(item,draft,()=>setEditing(false))}catch(saveError){setError(saveError.message||'Brevity could not prepare this change for review.')}finally{setSaving(false)}}
  const repair=async()=>{setSaving(true);setError('');try{await onSave(item,display)}catch(saveError){setError(saveError.message||'Brevity could not prepare the name correction for review.')}finally{setSaving(false)}}
  const toggle=async()=>{setSaving(true);setError('');try{await onToggle(item)}catch(saveError){setError(saveError.message||'Brevity could not prepare this status change for review.')}finally{setSaving(false)}}
  if(editing&&!readOnly)return <article className="fm-action-row fm-edit-row"><div className="fm-inline-editor"><textarea aria-label="Commitment text" value={draft.text} onChange={event=>setDraft(value=>({...value,text:event.target.value}))}/><select aria-label="Commitment owner" value={draft.owner||''} onChange={event=>setDraft(value=>({...value,owner:event.target.value}))}><option value="">Family</option>{HOUSEHOLD_MEMBERS.map(member=><option key={member}>{member}</option>)}</select><input aria-label="Commitment due date" type="date" value={draft.due||''} onChange={event=>setDraft(value=>({...value,due:event.target.value}))}/>{error&&<p className="fm-edit-error" role="alert">{error}</p>}<div><button type="button" disabled={saving} onClick={()=>{setDraft(display);setError('');setEditing(false)}}>Cancel</button><button type="button" className="fm-save" disabled={saving} onClick={review}>{saving?'Preparing review…':'Review changes'}</button></div></div></article>
  return <article className="fm-action-row"><button type="button" className={`fm-check${item.status==='done'?' is-done':''}`} aria-label={`${item.status==='done'?'Reopen':'Complete'} commitment: ${display.text}`} aria-pressed={item.status==='done'} disabled={readOnly||saving} onClick={readOnly?undefined:toggle}><i className={`ti ${item.status==='done'?'ti-check':'ti-circle'}`} aria-hidden="true"/></button><div><strong>{display.text}</strong><span>{display.owner||'Family'}{item.due?` · ${item.due}`:' · Meeting date'} · Family Calendar{item.updatedBy?` · edited by ${item.updatedBy}`:''}</span>{error&&<small className="fm-edit-error" role="alert">{error}</small>}</div>{!readOnly&&<div className="fm-row-actions">{needsNameRepair&&<button type="button" className="fm-edit" disabled={saving} onClick={repair}><i className="ti ti-spellcheck" aria-hidden="true"/> Apply name corrections</button>}<button type="button" className="fm-edit" aria-label={`Edit ${display.text}`} disabled={saving} onClick={()=>{setError('');setEditing(true)}}><i className="ti ti-edit" aria-hidden="true"/> Edit</button></div>}</article>
}

function CorrectionRow({item,onSave,onDismiss,onApprove,readOnly=false}){
  const display=canonicalMeetingCorrection(item),needsNameRepair=JSON.stringify(display)!==JSON.stringify(item)
  const[editing,setEditing]=useState(false),[draft,setDraft]=useState(display),[saving,setSaving]=useState(false),[error,setError]=useState(''),legacy=!item.origin
  useEffect(()=>setDraft(canonicalMeetingCorrection(item)),[item])
  const request=async(handler,draftValue,onApplied)=>{setSaving(true);setError('');try{await handler(item,draftValue,onApplied)}catch(saveError){setError(saveError.message||'Brevity could not prepare this correction change for review.')}finally{setSaving(false)}}
  if(editing&&!readOnly)return <article className={`fm-correction-row fm-edit-row${legacy?' is-unverified':''}`}><div className="fm-inline-editor"><input aria-label="Correction name" value={draft.label} onChange={event=>setDraft(value=>({...value,label:event.target.value}))}/><input aria-label="Correction value" value={draft.value} onChange={event=>setDraft(value=>({...value,value:event.target.value}))}/><textarea aria-label="Correction rationale" value={draft.reason||''} onChange={event=>setDraft(value=>({...value,reason:event.target.value}))} placeholder="Why is this correction needed?"/><textarea aria-label="Correction source detail" value={draft.origin||''} onChange={event=>setDraft(value=>({...value,origin:event.target.value}))} placeholder="Where did this number come from?"/><select aria-label="Correction source" value={draft.source} onChange={event=>setDraft(value=>({...value,source:event.target.value}))}>{SOURCE_STATES.map(source=><option key={source}>{source}</option>)}</select><select aria-label="Correction scope" value={draft.scope} onChange={event=>setDraft(value=>({...value,scope:event.target.value}))}><option>this occurrence</option><option>going forward</option><option>underlying data is wrong</option></select>{error&&<p className="fm-edit-error" role="alert">{error}</p>}<div><button type="button" disabled={saving} onClick={()=>{setDraft(item);setError('');setEditing(false)}}>Cancel</button><button type="button" className="fm-save" disabled={saving} onClick={()=>request(onSave,draft,()=>setEditing(false))}>{saving?'Preparing review…':'Review changes'}</button></div></div></article>
  return <article className={`fm-correction-row${legacy?' is-unverified':''}`}><div><strong>{display.label}: {display.value}</strong><span>{legacy?'Unverified legacy entry · source detail was not retained':`${item.source} · ${item.scope} · ${display.origin} · ${item.meetingDate||new Date(item.createdAt).toLocaleDateString()}`}</span>{display.reason&&<small>{display.reason}</small>}{item.updatedBy&&<small>Edited by {item.updatedBy} · {new Date(item.updatedAt).toLocaleString()}</small>}{error&&<small className="fm-edit-error" role="alert">{error}</small>}</div>{!readOnly&&<div className="fm-correction-actions">{needsNameRepair&&<button type="button" className="fm-edit" disabled={saving} onClick={()=>request(onSave,display)}><i className="ti ti-spellcheck"/> Apply name corrections</button>}<button type="button" className="fm-edit" disabled={saving} onClick={()=>{setError('');setEditing(true)}}><i className="ti ti-edit"/> Edit</button><button type="button" disabled={saving} onClick={()=>request(onDismiss,{...item,status:'dismissed'})}>Dismiss</button><button disabled={saving||legacy||item.status==='approved'} title={legacy?'Legacy entries without provenance cannot be approved.':''} onClick={()=>request(onApprove,{...item,status:'approved'})}>{legacy?'Needs source':item.status==='approved'?'Approved':'Approve'}</button></div>}</article>
}

function HistoryRow({item,onSave,readOnly=false}){
  const display=canonicalMeetingHistory(item),needsNameRepair=JSON.stringify(display)!==JSON.stringify(item)
  const[editing,setEditing]=useState(false),[draft,setDraft]=useState(display),[saving,setSaving]=useState(false),[error,setError]=useState('')
  useEffect(()=>setDraft(canonicalMeetingHistory(item)),[item])
  const review=async()=>{setSaving(true);setError('');try{await onSave(item,draft,()=>setEditing(false))}catch(saveError){setError(saveError.message||'Brevity could not prepare this meeting change for review.')}finally{setSaving(false)}}
  if(editing&&!readOnly)return <article className="fm-history-edit"><div className="fm-inline-editor"><textarea aria-label="Meeting summary" value={draft.summary||''} onChange={event=>setDraft(value=>({...value,summary:event.target.value}))} placeholder="Meeting summary"/><textarea aria-label="Meeting notes" value={draft.notes||''} onChange={event=>setDraft(value=>({...value,notes:event.target.value}))} placeholder="Meeting notes"/><textarea aria-label="Meeting transcript" value={draft.transcript||''} onChange={event=>setDraft(value=>({...value,transcript:event.target.value}))} placeholder="Meeting transcript"/>{error&&<p className="fm-edit-error" role="alert">{error}</p>}<div><button type="button" disabled={saving} onClick={()=>{setDraft(item);setError('');setEditing(false)}}>Cancel</button><button type="button" className="fm-save" disabled={saving} onClick={review}>{saving?'Preparing review…':'Review changes'}</button></div></div></article>
  return <article><div><strong>{LABELS[item.cadence]} Finance Meeting</strong><span>{new Date(item.endedAt).toLocaleString()}{item.updatedBy?` · edited by ${item.updatedBy}`:''}</span></div><small>{display.summary||display.notes||'Meeting captured and reconciled.'}</small>{!readOnly&&<div className="fm-row-actions">{needsNameRepair&&<button type="button" className="fm-edit" disabled={saving} onClick={()=>onSave(item,display)}><i className="ti ti-spellcheck"/> Apply name corrections</button>}<button type="button" className="fm-edit" onClick={()=>setEditing(true)}><i className="ti ti-edit"/> Edit</button></div>}</article>
}

export default function FinanceMeetingsWorkspace({liveSnapshot={},drilldowns={},accountScope='Selected checking and savings accounts',currentMember='Household member',readOnly=false,financeReadOnly=readOnly,meetingPlanningReadOnly=readOnly,balanceDataStatus='unknown',transactionFreshnessStatus='unknown',hasDistinctCurrentBalance=false,hasCashAccounts=true,actualMetricsAvailable=true}){
  const[workspace,setWorkspace]=useState(readStore)
  const[isRecording,setIsRecording]=useState(false),[startedAt,setStartedAt]=useState(null),[transcript,setTranscript]=useState(''),[notes,setNotes]=useState(''),[showReconcile,setShowReconcile]=useState(false)
  const[aiBusy,setAiBusy]=useState(false),[aiError,setAiError]=useState(''),[aiSummary,setAiSummary]=useState(''),[transcribing,setTranscribing]=useState(0),[commandNotice,setCommandNotice]=useState('')
  const[analysisDraft,setAnalysisDraft]=useState({actions:[],corrections:[]})
  const[restrictedFinancialDrafts,setRestrictedFinancialDrafts]=useState([])
  const[decision,setDecision]=useState({text:'',owner:'',due:''}),[correction,setCorrection]=useState({label:'',value:'',source:'User Confirmed',scope:'this occurrence'}),[drilldown,setDrilldown]=useState(null),[visionMode,setVisionMode]=useState('projected')
  const[selectedCadence,setSelectedCadence]=useState(()=>readStore().activeCadence||'weekly'),[mutationNotice,setMutationNotice]=useState('')
  const masterRef=useRef(null),segmentRef=useRef(null),streamRef=useRef(null),masterChunks=useRef([]),segmentTimer=useRef(null),recordingFlag=useRef(false),fileRef=useRef(null)
  const pendingReviewsRef=useRef(new Map())
  const cadence=selectedCadence
  const storedSnapshot=workspace.snapshot||{}
  const snapshot={
    ...freshSnapshot(),
    goalMonthlyNet:Number.isFinite(Number(storedSnapshot.goalMonthlyNet))?Number(storedSnapshot.goalMonthlyNet):50000,
    monthStatus:['green','yellow','red'].includes(storedSnapshot.monthStatus)?storedSnapshot.monthStatus:'yellow',
    expenseFocus:canonicalMeetingNameText(storedSnapshot.expenseFocus||freshSnapshot().expenseFocus),
  }
  AUTO_KEYS.forEach(key=>{const value=liveSnapshot?.[key];if(value!==''&&value!=null&&Number.isFinite(Number(value)))snapshot[key]=Number(value)})
  const normalizedBalanceStatus=normalizeMeetingSourceStatus(balanceDataStatus)
  const normalizedTransactionStatus=normalizeMeetingSourceStatus(transactionFreshnessStatus)
  const balanceQualification=meetingBalanceQualification(normalizedBalanceStatus,{hasDistinctCurrentBalance})
  const transactionQualification=meetingTransactionQualification(normalizedTransactionStatus,{actualMetricsAvailable})
  const balanceIsFresh=hasCashAccounts&&normalizedBalanceStatus==='fresh'
  const cashMetricLabel=hasDistinctCurrentBalance?'Available cash':'Cash balance'
  const hasCashBalanceValue=hasCashAccounts&&snapshot.operatingAvailable!==''&&snapshot.operatingAvailable!=null&&Number.isFinite(Number(snapshot.operatingAvailable))

  useEffect(()=>{
    const receiveSharedUpdate=event=>{if(event.detail?.keys?.includes(STORAGE_KEY))setWorkspace(readStore())}
    window.addEventListener(SHARED_STATE_EVENT,receiveSharedUpdate)
    return()=>window.removeEventListener(SHARED_STATE_EVENT,receiveSharedUpdate)
  },[])
  useEffect(()=>{
    const completed=event=>{
      const pending=pendingReviewsRef.current.get(event.detail?.proposalId)
      if(!pending)return
      pendingReviewsRef.current.delete(event.detail.proposalId)
      setWorkspace(readStore())
      setMutationNotice(`${pending.label} saved. The change is in Action Mode audit history and can be safely undone there.`)
      pending.onApplied?.()
    }
    window.addEventListener(ACTION_COMPLETED_EVENT,completed)
    return()=>window.removeEventListener(ACTION_COMPLETED_EVENT,completed)
  },[])
  useEffect(()=>()=>{recordingFlag.current=false;clearTimeout(segmentTimer.current);if(segmentRef.current?.state==='recording')segmentRef.current.stop();if(masterRef.current?.state==='recording')masterRef.current.stop();streamRef.current?.getTracks().forEach(track=>track.stop())},[])

  const invalidateAnalysis=()=>{setAiSummary('');setAnalysisDraft({actions:[],corrections:[]});setRestrictedFinancialDrafts([])}
  const setCadence=next=>{setSelectedCadence(next);invalidateAnalysis()}
  const updateTranscriptDraft=value=>{setTranscript(value);invalidateAnalysis()}
  const updateNotesDraft=value=>{setNotes(value);invalidateAnalysis()}
  const appendTranscript=text=>{if(meetingPlanningReadOnly)return;const cleaned=String(text||'').trim();if(!cleaned)return;setTranscript(current=>`${current}${current?'\n':''}${cleaned}`);invalidateAnalysis();if(/\b(?:hey\s+)?brevity\b/i.test(cleaned))setCommandNotice('Brevity command captured. The master recording continued without interruption.')}

  const runSegment=stream=>{
    if(meetingPlanningReadOnly||!recordingFlag.current)return
    let recorder
    try{recorder=new MediaRecorder(stream)}catch{return}
    const parts=[];segmentRef.current=recorder
    recorder.ondataavailable=event=>{if(event.data?.size)parts.push(event.data)}
    recorder.onstop=async()=>{
      clearTimeout(segmentTimer.current)
      if(parts.length){const blob=new Blob(parts,{type:parts[0]?.type||recorder.mimeType||'audio/webm'});setTranscribing(value=>value+1);try{const result=await transcribeMeetingAudio(blob);appendTranscript(result.text)}catch(error){setAiError(error.message||'A meeting segment could not be transcribed. The master recording was not interrupted.')}finally{setTranscribing(value=>Math.max(0,value-1))}}
      if(recordingFlag.current)runSegment(stream)
    }
    recorder.start();segmentTimer.current=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},25000)
  }

  const startMeeting=async()=>{
    if(meetingPlanningReadOnly)return
    setAiError('');setAiSummary('');setAnalysisDraft({actions:[],corrections:[]});setCommandNotice('');setShowReconcile(false);setTranscript('');setNotes('');masterChunks.current=[]
    let stream
    try{stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;const master=new MediaRecorder(stream);masterRef.current=master;master.ondataavailable=event=>{if(event.data?.size)masterChunks.current.push(event.data)};master.onstop=()=>{stream.getTracks().forEach(track=>track.stop());streamRef.current=null};recordingFlag.current=true;master.start(30000);runSegment(stream);setStartedAt(new Date().toISOString());setIsRecording(true)}catch(error){stream?.getTracks().forEach(track=>track.stop());window.alert(error?.message||'Brevity could not start the meeting recording.')}
  }
  const endMeeting=()=>{if(meetingPlanningReadOnly)return;recordingFlag.current=false;clearTimeout(segmentTimer.current);if(segmentRef.current?.state==='recording')segmentRef.current.stop();if(masterRef.current?.state==='recording')masterRef.current.stop();setIsRecording(false);setShowReconcile(true)}
  const saveRecording=()=>{if(meetingPlanningReadOnly||!masterChunks.current.length)return;const type=masterChunks.current[0]?.type||'audio/webm',blob=new Blob(masterChunks.current,{type}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`brevity-${cadence}-finance-${new Date().toISOString().slice(0,10)}.${/mp4/.test(type)?'m4a':'webm'}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
  const importTranscript=event=>{if(meetingPlanningReadOnly)return;const file=event.target.files?.[0];event.target.value='';if(!file)return;const reader=new FileReader();reader.onload=()=>updateTranscriptDraft(String(reader.result||''));reader.readAsText(file)}

  const reviewMutation=async({summary,operation,label,onApplied})=>{
    if(meetingPlanningReadOnly)throw new Error('Plans & decisions access is required to edit Finance Meeting narrative and commitments.')
    if(financeReadOnly&&['meeting.correction.create','meeting.correction.update','meeting.workspace.update'].includes(operation.type))throw new Error('Financial corrections and Finance Meeting guidance require household-administrator access.')
    setMutationNotice('')
    const proposal=await requestMeetingActionReview({summary,operation})
    pendingReviewsRef.current.set(proposal.id,{label,onApplied})
    return proposal
  }
  const addDecision=async()=>{
    if(meetingPlanningReadOnly||!decision.text.trim())return
    try{await reviewMutation({
      summary:'Add Finance Meeting commitment',
      operation:meetingActionCreateOperation(decision,{cadence,date:meetingDate()}),
      label:'Commitment',onApplied:()=>setDecision({text:'',owner:'',due:''}),
    })}catch(error){setMutationNotice(error.message||'Brevity could not prepare this commitment for review.')}
  }
  const toggleAction=(existing,onApplied)=>reviewMutation({
    summary:`${existing.status==='done'?'Reopen':'Complete'} Finance Meeting commitment`,
    operation:meetingActionOperation(existing,{...existing,status:existing.status==='done'?'open':'done'}),
    label:'Commitment status',onApplied,
  })
  const updateAction=(existing,changes,onApplied)=>reviewMutation({
    summary:'Edit Finance Meeting commitment',operation:meetingActionOperation(existing,changes),label:'Commitment',onApplied,
  })
  const addCorrection=async()=>{
    if(financeReadOnly||!correction.label.trim()||correction.value==='')return
    try{await reviewMutation({
      summary:'Stage proposed Finance Meeting correction',
      operation:meetingCorrectionCreateOperation(correction,{cadence,date:meetingDate()}),
      label:'Financial correction',onApplied:()=>setCorrection({label:'',value:'',source:'User Confirmed',scope:'this occurrence'}),
    })}catch(error){setMutationNotice(error.message||'Brevity could not prepare this correction for review.')}
  }
  const reviewCorrection=(existing,changes,onApplied)=>reviewMutation({
    summary:changes.status==='approved'?'Approve proposed financial correction':changes.status==='dismissed'?'Dismiss proposed financial correction':'Edit proposed financial correction',
    operation:meetingCorrectionOperation(existing,changes),label:'Financial correction',onApplied,
  })
  const approveCorrection=reviewCorrection
  const dismissCorrection=reviewCorrection
  const updateCorrection=(existing,changes,onApplied)=>reviewCorrection(existing,{...changes,status:'proposed'},onApplied)
  const updateMeeting=(existing,changes,onApplied)=>reviewMutation({
    summary:'Edit saved Finance Meeting record',operation:meetingHistoryOperation(existing,changes),label:'Meeting history',onApplied,
  })
  const reviewWorkspaceChange=change=>reviewMutation({
    summary:'Update Finance Meeting guidance',operation:meetingWorkspaceOperation(change),label:'Finance Meeting guidance',
  })

  const analyze=async()=>{if(meetingPlanningReadOnly||!transcript.trim())return;setAiBusy(true);setAiError('');try{
    const analysisSnapshot={...snapshot,sourceStatus:{balances:normalizedBalanceStatus,postedTransactions:normalizedTransactionStatus,scheduledActivity:'projected-not-completed',cashScope:hasCashAccounts?'available':'unavailable',actualMetrics:actualMetricsAvailable?'available':'unavailable'}}
    const result=await analyzeMeetingTranscript({transcript,cadence,snapshot:analysisSnapshot,notes})
    setAiSummary(canonicalMeetingNameText(result.summary||''))
    const extractedActions=[...(result.actions||[]),...(result.decisions||[]).map(item=>({text:item.text,owner:'',due:'',financialEffect:''}))].map(canonicalMeetingAction)
    const extractedCorrections=(result.corrections||[]).map(item=>canonicalMeetingCorrection({...item,origin:'meeting transcript analysis'}))
    const restricted=financeReadOnly?[...extractedCorrections,...extractedActions.filter(item=>String(item.financialEffect||'').trim())]:[]
    setRestrictedFinancialDrafts(restricted)
    setAnalysisDraft({
      actions:financeReadOnly?extractedActions.map(item=>({...item,financialEffect:''})):extractedActions,
      corrections:financeReadOnly?[]:extractedCorrections,
    })
    if((result.unresolved||[]).length)setNotes(current=>canonicalMeetingNameText(`${current}${current?'\n\n':''}Unresolved: ${(result.unresolved||[]).join(' · ')}`))
    setMutationNotice(restricted.length?`Analysis is ready for review. ${restricted.length} financial correction or financial-effect item${restricted.length===1?' requires':'s require'} administrator review and will not be included in this member proposal.`:'Analysis is ready for review. Nothing has been saved; approve the meeting updates to open Action Mode.')
  }catch(error){setAiError(error.message||'Brevity could not reconcile this meeting.')}finally{setAiBusy(false)}}
  const finalize=async()=>{
    if(meetingPlanningReadOnly)return
    const endedAt=new Date().toISOString()
    try{await reviewMutation({
      summary:`Save reviewed ${LABELS[cadence]} Finance Meeting updates`,
      operation:meetingSessionCreateOperation({cadence,meetingDate:meetingDate(),startedAt:startedAt||endedAt,endedAt,summary:aiSummary,notes,transcript,actions:financeReadOnly?analysisDraft.actions.map(item=>({...item,financialEffect:''})):analysisDraft.actions,corrections:financeReadOnly?[]:analysisDraft.corrections}),
      label:'Finance Meeting',
      onApplied:()=>{setShowReconcile(false);setStartedAt(null);setAiSummary('');setTranscript('');setNotes('');setAnalysisDraft({actions:[],corrections:[]})},
    })}catch(error){setAiError(error.message||'Brevity could not prepare this meeting for review.')}
  }

  const weeklyRisk=meetingCoverageTone({availableCash:snapshot.operatingAvailable,expectedInflows:snapshot.weekInflows,obligations:snapshot.weekObligations,balanceDataStatus:normalizedBalanceStatus})
  const dailyRisk=meetingCoverageTone({availableCash:snapshot.operatingAvailable,expectedInflows:snapshot.todayInflows,obligations:snapshot.todayObligations,balanceDataStatus:normalizedBalanceStatus})
  const cashGuidance=(risk,timeframe)=>!hasCashAccounts
    ? 'Cash coverage is unavailable until a checking or savings account is selected.'
    : !balanceIsFresh
    ? risk==='red'?`Stored figures suggest a ${timeframe} shortfall; verify live balances before acting.`:`Verify live balances before treating ${timeframe} cash coverage as safe.`
    : risk==='red'?'Immediate cash action required':risk==='yellow'?(timeframe==='today'?'Watch today’s obligations':'Watch this week’s obligations'):`${timeframe==='today'?'Today’s':'This week’s'} cash coverage looks safe`
  const monthGuidanceTone=balanceIsFresh?snapshot.monthStatus:snapshot.monthStatus==='red'?'red':'yellow'
  const monthGuidance=!hasCashAccounts?'Monthly cash coverage is unavailable until a checking or savings account is selected.':!balanceIsFresh?'Verify live balances before treating projected monthly coverage as confirmed.':snapshot.monthStatus==='green'?'Protect the plan':snapshot.monthStatus==='yellow'?'Move discretionary spend before savings':'Resolve shortfall before new spending'
  const visionSourceValue=visionMode==='projected'?snapshot.projectedMonthlyNet:(snapshot.actualMonthlyNet!==''?snapshot.actualMonthlyNet:snapshot.currentMonthlyNet)
  const hasVisionValue=visionSourceValue!==''&&visionSourceValue!=null&&Number.isFinite(Number(visionSourceValue))
  const visionNet=hasVisionValue?Number(visionSourceValue):null
  const visionDrilldown=visionMode==='projected'?drilldowns.projectedMonthlyNet:drilldowns.actualMonthlyNet||drilldowns.currentMonthlyNet
  const visionGap=hasVisionValue?Math.max(Number(snapshot.goalMonthlyNet||0)-visionNet,0):null
  const visionLabel=visionMode==='projected'?'Projected monthly net':'Actual monthly net'
  const openActions=(workspace.openActions||[]).filter(item=>item.status!=='done')
  const goalDrilldown={label:'Monthly net cash-flow vision',amount:snapshot.goalMonthlyNet,note:'Household vision target. This is a goal, not a calculated transaction total.',source:'Household financial vision',children:[]}
  const gapDrilldown={label:`Gap to monthly vision · ${visionMode==='projected'?'Projected':'Actual'}`,amount:visionGap,note:`Target monthly net cash flow minus ${visionMode} monthly net cash flow.`,source:'Vision target + finance data',children:[{label:'Vision target',amount:snapshot.goalMonthlyNet},{label:visionLabel,amount:visionNet,children:visionDrilldown?.children||[]} ]}
  const agenda=useMemo(()=>cadence==='monthly'?[['Vision','Are we closer to the household financial vision?'],['Performance','Did we finish cash-flow positive or negative, and why?'],['Forecast','What must be covered during the next 30–90 days?'],['Priorities','What three decisions matter most next month?']]:cadence==='quarterly'?[['Trajectory','Are income, reserves, debt and spending moving in the right direction?'],['Strategy','What materially changed this quarter?'],['Reallocation','What receives more money, less money, or no money next quarter?'],['Commitments','What three priorities define the next quarter?']]:[['Close','What did we earn, spend, save and eliminate this year?'],['Vision','How did actual results compare with the annual plan?'],['Direction','What are next year’s income, cash-flow, savings and debt targets?'],['Plan','What must be true to accomplish the next-year vision?']],[cadence])

  const visionToggle=<div className="fm-vision-toggle" role="group" aria-label="Vision calculation"><button type="button" className={visionMode==='actual'?'active':''} onClick={()=>setVisionMode('actual')}>Actual</button><button type="button" className={visionMode==='projected'?'active':''} onClick={()=>setVisionMode('projected')}>Projected</button></div>

  return <section className={`finance-meetings${isRecording?' is-recording':''}${financeReadOnly&&meetingPlanningReadOnly?' is-read-only':''}`}>
    <header className="fm-header"><div><p className="fm-eyebrow">Finance · Meetings</p><h1>Financial Operating Rhythm</h1><p>{JOBS[cadence]}</p><small className="fm-data-scope">Data scope: {accountScope}</small></div>{!meetingPlanningReadOnly&&<div className="fm-header-actions">{isRecording?<button className="fm-stop" onClick={endMeeting}><span className="fm-record-dot"/> End Meeting</button>:<button className="fm-primary" onClick={startMeeting}><i className="ti ti-microphone"/> Start Meeting</button>}</div>}</header>
    <nav className="fm-tabs">{CADENCES.map(item=><button key={item} className={cadence===item?'active':''} onClick={()=>setCadence(item)} disabled={isRecording}>{LABELS[item]}</button>)}</nav>
    <div className="fm-command-notice" role="status" aria-label="Finance Meeting data quality"><i className="ti ti-database" aria-hidden="true"/><span><strong>Balance:</strong> {balanceQualification} <strong>Actual bank activity:</strong> {transactionQualification} <strong>Scheduled activity:</strong> projections until explicitly reconciled to posted bank activity. Transfers within selected cash are neutral; transfers crossing the cash boundary count as projected inflows or obligations.</span></div>
    {!hasCashAccounts&&<div className="fm-command-notice" role="status" aria-label="Cash metrics unavailable"><i className="ti ti-alert-circle" aria-hidden="true"/><span><strong>Cash metrics unavailable.</strong> No checking or savings account is selected. Select an eligible cash account to calculate balances, inflows, obligations, and cash-flow totals; unavailable values are shown as —.</span></div>}
    {isRecording&&<div className="fm-recording-banner"><div><span className="fm-record-dot"/><strong>Recording is sacred</strong><span>One microphone stream feeds the uninterrupted master recording and Brevity transcription.</span></div><span>{transcribing?'Transcribing…':'Recording + transcription healthy'}</span></div>}
    {commandNotice&&<div className="fm-command-notice"><i className="ti ti-sparkles"/><span>{commandNotice}</span><button type="button" aria-label="Dismiss command notice" onClick={()=>setCommandNotice('')}><i className="ti ti-x" aria-hidden="true"/></button></div>}
    {mutationNotice&&<div className="fm-command-notice" role="status"><i className="ti ti-shield-check"/><span>{mutationNotice}</span><button type="button" aria-label="Dismiss saved-change notice" onClick={()=>setMutationNotice('')}><i className="ti ti-x" aria-hidden="true"/></button></div>}

    <div className="fm-kiss-grid">
      {cadence==='daily'?<>
        <article className="fm-kiss-card"><span className="fm-step">01</span><h2>Vision</h2><p>Keep today connected to the $50K monthly net-cash-flow target.</p>{visionToggle}<button type="button" className="fm-big-number fm-big-number--clickable" onClick={()=>setDrilldown(goalDrilldown)}>{money(snapshot.goalMonthlyNet)}<i className="ti ti-chevron-right"/></button><div className="fm-metrics"><Metric label={visionLabel} value={money(visionNet)} note={visionMode==='projected'?'Scheduled plan · projection':transactionQualification} onClick={hasVisionValue?()=>setDrilldown(visionDrilldown):undefined}/><Metric label="Gap to vision" value={money(visionGap)} note={visionMode==='projected'?'Compared with a scheduled projection':`Compared with ${normalizedTransactionStatus} actual bank activity`} onClick={hasVisionValue?()=>setDrilldown(gapDrilldown):undefined}/></div></article>
        <article className="fm-kiss-card"><span className="fm-step">02</span><h2>Cash</h2><p>Checking and savings only; credit, investments, loans, and other non-cash accounts do not count toward coverage.</p><div className="fm-metrics"><Metric label={cashMetricLabel} value={money(snapshot.operatingAvailable)} tone={dailyRisk} note={balanceQualification} onClick={hasCashBalanceValue?()=>setDrilldown(drilldowns.operatingAvailable):undefined}/>{hasDistinctCurrentBalance&&<Metric label="Current balance" value={money(snapshot.operatingBalance)} note="Bank current amount from the same verified refresh." onClick={()=>setDrilldown(drilldowns.operatingBalance)}/>}</div><div className={`fm-status fm-status--${dailyRisk}`}>{cashGuidance(dailyRisk,'today')}</div></article>
        <article className="fm-kiss-card"><span className="fm-step">03</span><h2>Today</h2><p>Scheduled movements remain projections until explicitly reconciled to posted bank activity. Cash-boundary transfers count; transfers within selected cash remain neutral.</p><div className="fm-metrics"><Metric label="Projected inflows" value={money(snapshot.todayInflows)} note="Scheduled today / tomorrow · includes inbound boundary transfers" onClick={hasCashAccounts?()=>setDrilldown(drilldowns.todayInflows):undefined}/><Metric label="Projected obligations" value={money(snapshot.todayObligations)} note="Scheduled today / tomorrow · includes outbound boundary transfers" onClick={hasCashAccounts?()=>setDrilldown(drilldowns.todayObligations):undefined}/><Metric label="Budget-derived discretionary limit" value={money(snapshot.approvedDiscretionary)} note="Planning amount · not bank activity" onClick={hasCashAccounts?()=>setDrilldown(drilldowns.approvedDiscretionary):undefined}/></div></article>
        <article className="fm-kiss-card fm-commitments-summary"><span className="fm-step">04</span><h2>Commitments</h2><p>One owner and one completion time per action.</p><strong className="fm-big-number">{openActions.length}</strong><small>{openActions.length?'Open commitments carry forward until completed and appear on the Family Calendar from this same record.':'No open commitments.'}</small><a className="fm-commitments-link" href="#finance-decisions-assignments">{meetingPlanningReadOnly?'Review':'Review and edit'} {openActions.length===1?'commitment':'commitments'}<i className="ti ti-arrow-down" aria-hidden="true"/></a></article>
      </>:cadence==='weekly'?<>
        <article className="fm-kiss-card"><span className="fm-step">01</span><h2>Vision</h2><p>Target monthly net cash flow</p>{visionToggle}<button type="button" className="fm-big-number fm-big-number--clickable" onClick={()=>setDrilldown(goalDrilldown)}>{money(snapshot.goalMonthlyNet)}<i className="ti ti-chevron-right"/></button><div className="fm-metrics"><Metric label={visionLabel} value={money(visionNet)} note={visionMode==='projected'?'Scheduled plan · projection':transactionQualification} onClick={hasVisionValue?()=>setDrilldown(visionDrilldown):undefined}/><Metric label="Gap to vision" value={money(visionGap)} note={visionMode==='projected'?'Compared with a scheduled projection':`Compared with ${normalizedTransactionStatus} actual bank activity`} onClick={hasVisionValue?()=>setDrilldown(gapDrilldown):undefined}/></div></article>
        <article className="fm-kiss-card"><span className="fm-step">02</span><h2>This Week</h2><p>Checking and savings only; scheduled movements are projections. Cash-boundary transfers count while transfers within selected cash remain neutral.</p><div className="fm-metrics"><Metric label={cashMetricLabel} value={money(snapshot.operatingAvailable)} tone={weeklyRisk} note={balanceQualification} onClick={hasCashBalanceValue?()=>setDrilldown(drilldowns.operatingAvailable):undefined}/><Metric label="Projected inflows" value={money(snapshot.weekInflows)} note="Scheduled this week · includes inbound boundary transfers" onClick={hasCashAccounts?()=>setDrilldown(drilldowns.weekInflows):undefined}/><Metric label="Projected obligations" value={money(snapshot.weekObligations)} note="Scheduled this week · includes outbound boundary transfers" onClick={hasCashAccounts?()=>setDrilldown(drilldowns.weekObligations):undefined}/></div><div className={`fm-status fm-status--${weeklyRisk}`}>{cashGuidance(weeklyRisk,'this week')}</div></article>
        <article className="fm-kiss-card"><span className="fm-step">03</span><h2>This Month</h2><p>Projected month-end net cash flow from scheduled plan entries.</p><Metric label="Month-end forecast" value={money(snapshot.monthForecast)} note="Projection · boundary transfers count; internal cash transfers are neutral · completion not assumed" onClick={hasCashAccounts?()=>setDrilldown(drilldowns.monthForecast):undefined}/><select aria-label="Month status" value={snapshot.monthStatus} onChange={event=>reviewWorkspaceChange({kind:'month-status',value:event.target.value}).catch(error=>setMutationNotice(error.message))} disabled={financeReadOnly}><option value="green">{balanceIsFresh?'Green — obligations covered':'Plan status saved — balance verification required'}</option><option value="yellow">Yellow — decisions required</option><option value="red">Red — shortfall projected</option></select><div className={`fm-status fm-status--${monthGuidanceTone}`}>{monthGuidance}</div></article>
        <article className="fm-kiss-card"><span className="fm-step">04</span><h2>Cut the Waste</h2><p>Review only the expenses big enough to change a decision.</p><ReviewableText label="Recurring expense focus" value={snapshot.expenseFocus} onReview={value=>reviewWorkspaceChange({kind:'expense-focus',value})} readOnly={financeReadOnly}/><small>Every recurring expense must earn its place every month.</small></article>
      </>:agenda.map(([title,question],index)=><article className="fm-kiss-card" key={title}><span className="fm-step">0{index+1}</span><h2>{title}</h2><p>{question}</p><ReviewableText label={`${LABELS[cadence]} ${title} decision note`} value={canonicalMeetingNameText(workspace.cadenceNotes?.[cadence]?.[index]||'')} onReview={value=>reviewWorkspaceChange({kind:'cadence-note',cadence,index,value})} readOnly={financeReadOnly} placeholder="Capture only what changes a decision…"/></article>)}
    </div>

    <section className="fm-workbench"><div className="fm-panel" id="finance-decisions-assignments"><div className="fm-panel-title"><div><span>Decisions & Assignments</span><small>{meetingPlanningReadOnly?'Review the household’s existing commitments.':'The authoritative list for reviewing and editing commitments. The Family Calendar derives its copy from this record so edits never drift.'}</small></div><i className="ti ti-list-check"/></div>{!meetingPlanningReadOnly&&<div className="fm-form-grid"><input value={decision.text} onChange={event=>setDecision(value=>({...value,text:event.target.value}))} placeholder="What did we decide?"/><select aria-label="New commitment owner" value={decision.owner} onChange={event=>setDecision(value=>({...value,owner:event.target.value}))}><option value="">Family</option>{HOUSEHOLD_MEMBERS.map(member=><option key={member}>{member}</option>)}</select><input type="date" aria-label="Assignment due date" value={decision.due} onChange={event=>setDecision(value=>({...value,due:event.target.value}))}/><button onClick={addDecision}>Review commitment</button></div>}<div className="fm-action-list">{(workspace.openActions||[]).length?(workspace.openActions||[]).map(item=><Action key={item.id} item={item} onToggle={toggleAction} onSave={updateAction} readOnly={meetingPlanningReadOnly}/>):<p className="fm-empty">No commitments yet.</p>}</div></div>
      <div className="fm-panel"><div className="fm-panel-title"><div><span>Proposed Financial Corrections</span><small>{financeReadOnly?'Administrator review is required to create, edit, approve, or dismiss financial corrections.':'Review proposals here. Approval records the decision; it does not alter bank data.'}</small></div><i className="ti ti-adjustments"/></div>{!financeReadOnly&&<div className="fm-correction-grid"><input value={correction.label} onChange={event=>setCorrection(value=>({...value,label:event.target.value}))} placeholder="What changed?"/><input value={correction.value} onChange={event=>setCorrection(value=>({...value,value:event.target.value}))} placeholder="Correct value"/><select value={correction.source} onChange={event=>setCorrection(value=>({...value,source:event.target.value}))}>{SOURCE_STATES.map(source=><option key={source}>{source}</option>)}</select><select value={correction.scope} onChange={event=>setCorrection(value=>({...value,scope:event.target.value}))}><option>this occurrence</option><option>going forward</option><option>underlying data is wrong</option></select><button onClick={addCorrection}>Review correction</button></div>}{(workspace.corrections||[]).filter(item=>item.status!=='dismissed').slice(0,8).map(item=><CorrectionRow key={item.id} item={item} onSave={updateCorrection} onDismiss={dismissCorrection} onApprove={approveCorrection} readOnly={financeReadOnly}/>)}</div></section>

    {!meetingPlanningReadOnly&&<section className="fm-capture"><div className="fm-panel-title"><div><span>Meeting Capture</span><small>Live transcript and analysis remain drafts until you review and apply them in Action Mode.</small></div><div className="fm-capture-actions"><button onClick={()=>fileRef.current?.click()}><i className="ti ti-file-upload"/> Import Otter</button><input ref={fileRef} type="file" accept=".txt,.vtt,.srt,text/plain,text/vtt" onChange={importTranscript} hidden/>{masterChunks.current.length>0&&<button onClick={saveRecording}><i className="ti ti-download"/> Save recording</button>}<button onClick={analyze} disabled={aiBusy||!transcript.trim()}><i className="ti ti-sparkles"/> {aiBusy?'Analyzing…':'Analyze with Brevity'}</button>{!isRecording&&Boolean(transcript.trim()||notes.trim()||aiSummary.trim())&&<button className="fm-primary" onClick={finalize}>Review Meeting Updates</button>}</div></div>{aiError&&<div className="fm-ai-error">{aiError}</div>}{restrictedFinancialDrafts.length>0&&<div className="fm-ai-error" role="status"><strong>Administrator review required.</strong> {restrictedFinancialDrafts.length} financial correction or financial-effect item{restrictedFinancialDrafts.length===1?' is':'s are'} held out of this member proposal. Narrative, transcript, and ordinary commitments can still be reviewed now.</div>}{aiSummary&&<div className="fm-ai-summary"><strong>Brevity summary · draft</strong><textarea aria-label="Brevity meeting summary" value={aiSummary} onChange={event=>setAiSummary(event.target.value)} rows="4"/><small>{analysisDraft.actions.length} extracted commitments · {financeReadOnly?`${restrictedFinancialDrafts.length} financial items held for administrator review`:`${analysisDraft.corrections.length} proposed corrections`}. These are not saved yet.</small></div>}<textarea className="fm-transcript" value={transcript} onChange={event=>updateTranscriptDraft(event.target.value)} rows="9" placeholder="Live transcription appears here. You can also paste or import an Otter transcript."/><textarea className="fm-notes" value={notes} onChange={event=>updateNotesDraft(event.target.value)} rows="3" placeholder="Optional meeting notes or unresolved context…"/></section>}

    {!meetingPlanningReadOnly&&showReconcile&&<section className="fm-reconcile"><div><p className="fm-eyebrow">Meeting Reconciliation</p><h2>Review what Brevity should remember.</h2><p>Run Brevity analysis, inspect the draft summary, then send the meeting and extracted updates to Action Mode. Applying the confirmation creates one versioned Finance Meetings record with immutable audit history and safe Undo. {financeReadOnly?'Financial corrections and financial-effect details remain held for administrator review.':'Bank history is never overwritten by meeting speech.'}</p></div><div className="fm-reconcile-actions"><button onClick={()=>setShowReconcile(false)}>Keep reviewing</button><button onClick={analyze} disabled={aiBusy||!transcript.trim()}>Analyze first</button><button className="fm-primary" onClick={finalize}>Review Meeting Updates</button></div></section>}
    {(workspace.meetings||[]).length>0&&<section className="fm-history"><div className="fm-panel-title"><div><span>Meeting History</span><small>Institutional memory for the household</small></div></div>{workspace.meetings.slice(0,6).map(item=><HistoryRow key={item.id} item={item} onSave={updateMeeting} readOnly={meetingPlanningReadOnly}/>)}</section>}
    <MetricDrilldown node={drilldown} onClose={()=>setDrilldown(null)}/>
  </section>
}
