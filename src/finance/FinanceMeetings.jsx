import { useEffect, useMemo, useRef, useState } from 'react'
import './FinanceMeetings.css'

const STORAGE_KEY = 'brevity_finance_meetings_v1'
const FINANCE_KEY = 'lslj_finance_v9'
const CADENCES = ['daily','weekly','monthly','quarterly','yearly']
const CADENCE_LABELS = { daily:'Daily', weekly:'Weekly', monthly:'Monthly', quarterly:'Quarterly', yearly:'Yearly' }
const CADENCE_JOBS = {
  daily:'Protect today’s cash and execute today’s commitments.',
  weekly:'Resolve exceptions and coordinate the next two weeks.',
  monthly:'Measure performance and update the household plan.',
  quarterly:'Reassess trajectory and reallocate priorities.',
  yearly:'Close the year and set the next year’s financial direction.',
}
const SOURCE_STATES = ['Bank Verified','Forecast','User Confirmed','Proposed']

const emptyWorkspace = () => ({
  activeCadence:'weekly',
  meetings:[],
  corrections:[],
  openActions:[],
  snapshot:{
    goalMonthlyNet:50000,
    currentMonthlyNet:'',
    operatingBalance:'',
    operatingAvailable:'',
    weekInflows:'',
    weekObligations:'',
    monthForecast:'',
    monthStatus:'yellow',
    expenseFocus:'Gym · Phone · Cable · Subscriptions · Food waste',
  },
})

function readStored() {
  try { return { ...emptyWorkspace(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } } catch { return emptyWorkspace() }
}

function currency(value) {
  if (value === '' || value == null || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value))
}

function findOperatingBalance() {
  try {
    const finance = JSON.parse(localStorage.getItem(FINANCE_KEY) || '{}')
    const accounts = Array.isArray(finance.accounts) ? finance.accounts : []
    const account = accounts.find(item => /operating/i.test(item.name || item.accountName || ''))
    if (!account) return null
    const current = account.current ?? account.balance ?? account.currentBalance
    const available = account.available ?? account.availableBalance ?? current
    return { current, available }
  } catch { return null }
}

function Metric({ label, value, sub, tone='neutral' }) {
  return <div className={`fm-metric fm-metric--${tone}`}><span>{label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>
}

function DecisionRow({ item, onToggle }) {
  return <article className="fm-action-row"><button type="button" className={`fm-check${item.status==='done'?' is-done':''}`} onClick={()=>onToggle(item.id)} aria-label={item.status==='done'?'Reopen action':'Complete action'}><i className={`ti ${item.status==='done'?'ti-check':'ti-circle'}`}/></button><div><strong>{item.text}</strong><span>{item.owner || 'Unassigned'}{item.due ? ` · ${item.due}` : ''}</span></div></article>
}

export default function FinanceMeetings({ currentMember }) {
  const [workspace,setWorkspace]=useState(readStored)
  const [isRecording,setIsRecording]=useState(false)
  const [recordingStartedAt,setRecordingStartedAt]=useState(null)
  const [transcript,setTranscript]=useState('')
  const [meetingNotes,setMeetingNotes]=useState('')
  const [decisionText,setDecisionText]=useState('')
  const [decisionOwner,setDecisionOwner]=useState(currentMember || '')
  const [decisionDue,setDecisionDue]=useState('')
  const [correction,setCorrection]=useState({label:'',value:'',source:'User Confirmed',scope:'this occurrence'})
  const [showReconcile,setShowReconcile]=useState(false)
  const recorderRef=useRef(null)
  const streamRef=useRef(null)
  const chunksRef=useRef([])
  const transcriptFileRef=useRef(null)

  const cadence=workspace.activeCadence || 'weekly'
  const snapshot=workspace.snapshot || emptyWorkspace().snapshot
  const operatingRisk = Number(snapshot.weekObligations||0) > (Number(snapshot.operatingAvailable||0)+Number(snapshot.weekInflows||0)) ? 'red' : Number(snapshot.operatingAvailable||0) < Number(snapshot.weekObligations||0) ? 'yellow' : 'green'
  const monthTone=snapshot.monthStatus==='green'?'green':snapshot.monthStatus==='red'?'red':'yellow'

  useEffect(()=>{localStorage.setItem(STORAGE_KEY,JSON.stringify(workspace))},[workspace])
  useEffect(()=>{
    const found=findOperatingBalance()
    if (!found) return
    setWorkspace(current=>{
      if (current.snapshot?.operatingBalance !== '' || current.snapshot?.operatingAvailable !== '') return current
      return {...current,snapshot:{...current.snapshot,operatingBalance:found.current ?? '',operatingAvailable:found.available ?? ''}}
    })
  },[])
  useEffect(()=>()=>{streamRef.current?.getTracks().forEach(track=>track.stop())},[])

  const updateSnapshot=(key,value)=>setWorkspace(current=>({...current,snapshot:{...current.snapshot,[key]:value}}))
  const setCadence=next=>setWorkspace(current=>({...current,activeCadence:next}))

  const startMeeting=async()=>{
    setShowReconcile(false)
    setTranscript('')
    setMeetingNotes('')
    chunksRef.current=[]
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:true})
      const recorder=new MediaRecorder(stream)
      streamRef.current=stream
      recorderRef.current=recorder
      recorder.ondataavailable=event=>{if(event.data?.size)chunksRef.current.push(event.data)}
      recorder.onstop=()=>{
        stream.getTracks().forEach(track=>track.stop())
        streamRef.current=null
      }
      recorder.start(30000)
      setRecordingStartedAt(new Date().toISOString())
      setIsRecording(true)
    } catch (error) {
      window.alert(error?.message || 'Brevity could not start the meeting recording.')
    }
  }

  const endMeeting=()=>{
    recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop()
    setIsRecording(false)
    setShowReconcile(true)
  }

  const downloadRecording=()=>{
    if (!chunksRef.current.length) return
    const type=chunksRef.current[0]?.type || 'audio/webm'
    const blob=new Blob(chunksRef.current,{type})
    const url=URL.createObjectURL(blob)
    const link=document.createElement('a')
    link.href=url
    link.download=`brevity-${cadence}-finance-meeting-${new Date().toISOString().slice(0,10)}.webm`
    link.click()
    setTimeout(()=>URL.revokeObjectURL(url),500)
  }

  const importTranscript=event=>{
    const file=event.target.files?.[0]
    event.target.value=''
    if(!file)return
    const reader=new FileReader()
    reader.onload=()=>setTranscript(String(reader.result||''))
    reader.readAsText(file)
  }

  const addDecision=()=>{
    if(!decisionText.trim())return
    const item={id:`action-${Date.now()}`,text:decisionText.trim(),owner:decisionOwner.trim(),due:decisionDue,status:'open',createdAt:new Date().toISOString(),cadence}
    setWorkspace(current=>({...current,openActions:[item,...(current.openActions||[])]}))
    setDecisionText('');setDecisionDue('')
  }

  const toggleAction=id=>setWorkspace(current=>({...current,openActions:(current.openActions||[]).map(item=>item.id===id?{...item,status:item.status==='done'?'open':'done'}:item)}))

  const addCorrection=()=>{
    if(!correction.label.trim()||correction.value==='')return
    const item={...correction,id:`correction-${Date.now()}`,status:'proposed',createdAt:new Date().toISOString(),cadence}
    setWorkspace(current=>({...current,corrections:[item,...(current.corrections||[])]}))
    setCorrection({label:'',value:'',source:'User Confirmed',scope:'this occurrence'})
  }

  const approveCorrection=id=>setWorkspace(current=>({...current,corrections:(current.corrections||[]).map(item=>item.id===id?{...item,status:'approved',approvedAt:new Date().toISOString()}:item)}))

  const finalizeMeeting=()=>{
    const record={id:`meeting-${Date.now()}`,cadence,startedAt:recordingStartedAt||new Date().toISOString(),endedAt:new Date().toISOString(),notes:meetingNotes,transcript,actionIds:(workspace.openActions||[]).filter(item=>item.createdAt>=String(recordingStartedAt||'')).map(item=>item.id),correctionIds:(workspace.corrections||[]).filter(item=>item.createdAt>=String(recordingStartedAt||'')).map(item=>item.id)}
    setWorkspace(current=>({...current,meetings:[record,...(current.meetings||[])]}))
    setShowReconcile(false)
    setRecordingStartedAt(null)
    setTranscript('')
    setMeetingNotes('')
  }

  const currentAgenda=useMemo(()=>{
    if(cadence==='daily') return [
      ['Vision','Connect today’s discipline to the $50K monthly net-cash-flow vision.'],['Cash','Available operating cash and anything materially changed since yesterday.'],['Today','Deposits, obligations, approved spending, and income-producing actions.'],['Commitments','One owner and one completion time for every action.']]
    if(cadence==='weekly') return [
      ['Vision','Are we moving toward $50K/month net cash flow?'],['This Week','Can Operating cover this week’s obligations without a rescue transfer?'],['This Month','Will expected income cover the month without using savings?'],['Cut the Waste','What necessities must stay, and which niceties should be reduced or canceled?']]
    if(cadence==='monthly') return [
      ['Vision','Are we closer to the household financial vision?'],['Performance','Did we finish the month cash-flow positive or negative, and why?'],['Forecast','What must be covered during the next 30–90 days?'],['Priorities','What three decisions matter most next month?']]
    if(cadence==='quarterly') return [
      ['Trajectory','Are income, reserves, debt and spending moving in the right direction?'],['Strategy','What materially changed this quarter?'],['Reallocation','What should receive more money, less money, or no money next quarter?'],['Commitments','What three priorities define the next quarter?']]
    return [['Close','What did the household earn, spend, save and eliminate this year?'],['Vision','How did actual results compare with the annual plan?'],['Direction','What are next year’s income, net-cash-flow, savings and debt targets?'],['Plan','What must be true for the household to accomplish the next-year vision?']]
  },[cadence])

  return <section className="finance-meetings">
    <header className="fm-header"><div><p className="fm-eyebrow">Finance · Meetings</p><h1>Financial Operating Rhythm</h1><p>{CADENCE_JOBS[cadence]}</p></div><div className="fm-header-actions">{isRecording?<button className="fm-stop" onClick={endMeeting}><span className="fm-record-dot"/> End Meeting</button>:<button className="fm-primary" onClick={startMeeting}><i className="ti ti-microphone"/> Start Meeting</button>}</div></header>

    <nav className="fm-tabs" aria-label="Finance meeting cadence">{CADENCES.map(item=><button key={item} className={cadence===item?'active':''} onClick={()=>setCadence(item)}>{CADENCE_LABELS[item]}</button>)}</nav>

    {isRecording&&<div className="fm-recording-banner"><div><span className="fm-record-dot"/><strong>Recording is sacred</strong><span>Master audio is recording continuously in 30-second chunks.</span></div><span>Intelligence never interrupts the recording.</span></div>}

    <div className="fm-kiss-grid">
      {cadence==='weekly'&&<>
        <article className="fm-kiss-card"><span className="fm-step">01</span><h2>Vision</h2><p>Target monthly net cash flow</p><div className="fm-big-number">{currency(snapshot.goalMonthlyNet)}</div><label>Current monthly net cash flow<input type="number" value={snapshot.currentMonthlyNet} onChange={e=>updateSnapshot('currentMonthlyNet',e.target.value)} placeholder="Enter current"/></label></article>
        <article className="fm-kiss-card"><span className="fm-step">02</span><h2>This Week</h2><div className="fm-metrics"><Metric label="Operating available" value={currency(snapshot.operatingAvailable)} tone={operatingRisk}/><Metric label="Expected inflows" value={currency(snapshot.weekInflows)}/><Metric label="Obligations" value={currency(snapshot.weekObligations)}/></div><div className={`fm-status fm-status--${operatingRisk}`}>{operatingRisk==='red'?'Action required':operatingRisk==='yellow'?'Watch cash closely':'Cash coverage looks safe'}</div></article>
        <article className="fm-kiss-card"><span className="fm-step">03</span><h2>This Month</h2><p>Projected month-end net cash flow</p><label className="fm-inline-input"><input type="number" value={snapshot.monthForecast} onChange={e=>updateSnapshot('monthForecast',e.target.value)} placeholder="Forecast"/></label><select value={snapshot.monthStatus} onChange={e=>updateSnapshot('monthStatus',e.target.value)}><option value="green">Green — obligations covered</option><option value="yellow">Yellow — decisions required</option><option value="red">Red — shortfall projected</option></select><div className={`fm-status fm-status--${monthTone}`}>{snapshot.monthStatus==='green'?'Protect the plan':snapshot.monthStatus==='yellow'?'Move or reduce discretionary spend before savings':'Resolve shortfall before new spending'}</div></article>
        <article className="fm-kiss-card"><span className="fm-step">04</span><h2>Cut the Waste</h2><p>Necessities vs. niceties. Review only the expenses big enough to change a decision.</p><textarea value={snapshot.expenseFocus} onChange={e=>updateSnapshot('expenseFocus',e.target.value)} rows="4"/><small>Every recurring expense must earn its place every month.</small></article>
      </>}
      {cadence!=='weekly'&&currentAgenda.map(([title,question],index)=><article className="fm-kiss-card" key={title}><span className="fm-step">0{index+1}</span><h2>{title}</h2><p>{question}</p><textarea rows="4" placeholder="Capture only what changes a decision…"/></article>)}
    </div>

    <section className="fm-workbench">
      <div className="fm-panel"><div className="fm-panel-title"><div><span>Decisions & Assignments</span><small>Carried forward until completed</small></div><i className="ti ti-list-check"/></div><div className="fm-form-grid"><input value={decisionText} onChange={e=>setDecisionText(e.target.value)} placeholder="What did we decide?"/><input value={decisionOwner} onChange={e=>setDecisionOwner(e.target.value)} placeholder="Owner"/><input type="date" value={decisionDue} onChange={e=>setDecisionDue(e.target.value)}/><button onClick={addDecision}>Add</button></div><div className="fm-action-list">{(workspace.openActions||[]).length?(workspace.openActions||[]).map(item=><DecisionRow key={item.id} item={item} onToggle={toggleAction}/>):<p className="fm-empty">No open commitments.</p>}</div></div>

      <div className="fm-panel"><div className="fm-panel-title"><div><span>Financial Corrections</span><small>AI proposes. Humans approve financial truth.</small></div><i className="ti ti-adjustments"/></div><div className="fm-correction-grid"><input value={correction.label} onChange={e=>setCorrection(c=>({...c,label:e.target.value}))} placeholder="What number or assumption changed?"/><input value={correction.value} onChange={e=>setCorrection(c=>({...c,value:e.target.value}))} placeholder="Correct value"/><select value={correction.source} onChange={e=>setCorrection(c=>({...c,source:e.target.value}))}>{SOURCE_STATES.map(s=><option key={s}>{s}</option>)}</select><select value={correction.scope} onChange={e=>setCorrection(c=>({...c,scope:e.target.value}))}><option>this occurrence</option><option>going forward</option><option>underlying data is wrong</option></select><button onClick={addCorrection}>Stage correction</button></div>{(workspace.corrections||[]).slice(0,6).map(item=><article className="fm-correction-row" key={item.id}><div><strong>{item.label}: {item.value}</strong><span>{item.source} · {item.scope}</span></div><button disabled={item.status==='approved'} onClick={()=>approveCorrection(item.id)}>{item.status==='approved'?'Approved':'Approve'}</button></article>)}</div>
    </section>

    <section className="fm-capture"><div className="fm-panel-title"><div><span>Meeting Capture</span><small>One recording stream. Transcript and intelligence operate on top.</small></div><div className="fm-capture-actions"><button onClick={()=>transcriptFileRef.current?.click()}><i className="ti ti-file-upload"/> Import Otter transcript</button><input ref={transcriptFileRef} type="file" accept=".txt,.vtt,.srt,text/plain,text/vtt" onChange={importTranscript} hidden/>{chunksRef.current.length>0&&<button onClick={downloadRecording}><i className="ti ti-download"/> Save recording</button>}</div></div><textarea className="fm-transcript" value={transcript} onChange={e=>setTranscript(e.target.value)} rows="8" placeholder="Paste or import the Otter transcript here. During an active meeting, Brevity’s master recording remains independent from transcript capture."/><textarea className="fm-notes" value={meetingNotes} onChange={e=>setMeetingNotes(e.target.value)} rows="3" placeholder="Optional meeting notes or context…"/></section>

    {showReconcile&&<section className="fm-reconcile"><div><p className="fm-eyebrow">Meeting Reconciliation</p><h2>Approve what Brevity should remember.</h2><p>Review decisions, staged financial corrections and transcript notes. Approved financial corrections preserve their source and scope; they do not overwrite bank history.</p></div><div className="fm-reconcile-actions"><button onClick={()=>setShowReconcile(false)}>Keep reviewing</button><button className="fm-primary" onClick={finalizeMeeting}>Approve Meeting Updates</button></div></section>}

    {(workspace.meetings||[]).length>0&&<section className="fm-history"><div className="fm-panel-title"><div><span>Meeting History</span><small>Institutional memory for the household</small></div></div>{workspace.meetings.slice(0,5).map(item=><article key={item.id}><div><strong>{CADENCE_LABELS[item.cadence]} Finance Meeting</strong><span>{new Date(item.endedAt).toLocaleString()}</span></div><small>{item.notes || 'Meeting captured and reconciled.'}</small></article>)}</section>}
  </section>
}
