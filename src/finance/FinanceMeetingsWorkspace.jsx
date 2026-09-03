import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzeMeetingTranscript, transcribeMeetingAudio } from './meetingApi.js'
import MetricDrilldown from './MetricDrilldown.jsx'
import { syncMeetingActionToCalendar } from './meetingCalendar.js'
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
const id=prefix=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
const meetingDate=()=>new Date().toISOString().slice(0,10)

function Metric({label,value,tone='neutral',note,onClick}){
  const Tag=onClick?'button':'div'
  return <Tag type={onClick?'button':undefined} className={`fm-metric fm-metric--${tone}${onClick?' fm-metric--clickable':''}`} onClick={onClick}><span>{label}</span><strong>{value}</strong>{note&&<small>{note}</small>}{onClick&&<i className="ti ti-chevron-right fm-metric-chevron"/>}</Tag>
}
function Action({item,onToggle}){return <article className="fm-action-row"><button type="button" className={`fm-check${item.status==='done'?' is-done':''}`} onClick={()=>onToggle(item.id)}><i className={`ti ${item.status==='done'?'ti-check':'ti-circle'}`}/></button><div><strong>{item.text}</strong><span>{item.owner||'Family'}{item.due?` · ${item.due}`:' · Meeting date'}{item.calendarPublished?' · Calendar':''}</span></div></article>}

export default function FinanceMeetingsWorkspace({liveSnapshot={},drilldowns={},accountScope='Selected accounts'}){
  const[workspace,setWorkspace]=useState(readStore)
  const[isRecording,setIsRecording]=useState(false),[startedAt,setStartedAt]=useState(null),[transcript,setTranscript]=useState(''),[notes,setNotes]=useState(''),[showReconcile,setShowReconcile]=useState(false)
  const[aiBusy,setAiBusy]=useState(false),[aiError,setAiError]=useState(''),[aiSummary,setAiSummary]=useState(''),[transcribing,setTranscribing]=useState(0),[commandNotice,setCommandNotice]=useState('')
  const[decision,setDecision]=useState({text:'',owner:'',due:''}),[correction,setCorrection]=useState({label:'',value:'',source:'User Confirmed',scope:'this occurrence'}),[drilldown,setDrilldown]=useState(null),[visionMode,setVisionMode]=useState('actual')
  const masterRef=useRef(null),segmentRef=useRef(null),streamRef=useRef(null),masterChunks=useRef([]),segmentTimer=useRef(null),recordingFlag=useRef(false),fileRef=useRef(null)
  const cadence=workspace.activeCadence||'weekly',snapshot=workspace.snapshot||freshSnapshot()

  useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(workspace))}catch{}},[workspace])
  useEffect(()=>{
    if(!liveSnapshot||typeof liveSnapshot!=='object')return
    setWorkspace(current=>{
      const previousAuto=current.autoSnapshot||{},nextSnapshot={...freshSnapshot(),...(current.snapshot||{})}
      AUTO_KEYS.forEach(key=>{
        if(!Object.prototype.hasOwnProperty.call(liveSnapshot,key))return
        const incoming=Number.isFinite(Number(liveSnapshot[key]))?Number(liveSnapshot[key]):''
        const currentValue=nextSnapshot[key]
        const wasAutomatic=currentValue===''||currentValue==null||(Object.prototype.hasOwnProperty.call(previousAuto,key)&&Number(currentValue)===Number(previousAuto[key]))
        if(wasAutomatic)nextSnapshot[key]=incoming
      })
      return{...current,snapshot:nextSnapshot,autoSnapshot:{...liveSnapshot}}
    })
  },[liveSnapshot])
  useEffect(()=>()=>{recordingFlag.current=false;clearTimeout(segmentTimer.current);if(segmentRef.current?.state==='recording')segmentRef.current.stop();if(masterRef.current?.state==='recording')masterRef.current.stop();streamRef.current?.getTracks().forEach(track=>track.stop())},[])

  const updateSnapshot=(key,value)=>setWorkspace(current=>({...current,snapshot:{...current.snapshot,[key]:value}}))
  const setCadence=next=>setWorkspace(current=>({...current,activeCadence:next}))
  const updateCadenceNote=(index,value)=>setWorkspace(current=>({...current,cadenceNotes:{...(current.cadenceNotes||{}),[cadence]:{...(current.cadenceNotes?.[cadence]||{}),[index]:value}}}))
  const appendTranscript=text=>{const cleaned=String(text||'').trim();if(!cleaned)return;setTranscript(current=>`${current}${current?'\n':''}${cleaned}`);if(/\b(?:hey\s+)?brevity\b/i.test(cleaned))setCommandNotice('Brevity command captured. The master recording continued without interruption.')}

  const runSegment=stream=>{
    if(!recordingFlag.current)return
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
    setAiError('');setAiSummary('');setCommandNotice('');setShowReconcile(false);setTranscript('');setNotes('');masterChunks.current=[]
    let stream
    try{stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;const master=new MediaRecorder(stream);masterRef.current=master;master.ondataavailable=event=>{if(event.data?.size)masterChunks.current.push(event.data)};master.onstop=()=>{stream.getTracks().forEach(track=>track.stop());streamRef.current=null};recordingFlag.current=true;master.start(30000);runSegment(stream);setStartedAt(new Date().toISOString());setIsRecording(true)}catch(error){stream?.getTracks().forEach(track=>track.stop());window.alert(error?.message||'Brevity could not start the meeting recording.')}
  }
  const endMeeting=()=>{recordingFlag.current=false;clearTimeout(segmentTimer.current);if(segmentRef.current?.state==='recording')segmentRef.current.stop();if(masterRef.current?.state==='recording')masterRef.current.stop();setIsRecording(false);setShowReconcile(true)}
  const saveRecording=()=>{if(!masterChunks.current.length)return;const type=masterChunks.current[0]?.type||'audio/webm',blob=new Blob(masterChunks.current,{type}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`brevity-${cadence}-finance-${new Date().toISOString().slice(0,10)}.${/mp4/.test(type)?'m4a':'webm'}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
  const importTranscript=event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;const reader=new FileReader();reader.onload=()=>setTranscript(String(reader.result||''));reader.readAsText(file)}

  const addAction=(item,{publish=false}={})=>{
    if(!String(item?.text||'').trim())return null
    const action={id:id('action'),text:String(item.text).trim(),owner:String(item.owner||'').trim(),due:item.due||'',meetingDate:meetingDate(),financialEffect:item.financialEffect||'',status:'open',createdAt:new Date().toISOString(),cadence,calendarPublished:false}
    if(publish){const result=syncMeetingActionToCalendar(localStorage,action);action.calendarPublished=Boolean(result.ok)}
    setWorkspace(current=>({...current,openActions:[action,...(current.openActions||[])]}))
    return action
  }
  const addDecision=()=>{if(!decision.text.trim())return;addAction(decision,{publish:true});setDecision({text:'',owner:'',due:''})}
  const toggleAction=actionId=>{
    const existing=(workspace.openActions||[]).find(item=>item.id===actionId)
    if(!existing)return
    const updated={...existing,status:existing.status==='done'?'open':'done'}
    const result=syncMeetingActionToCalendar(localStorage,updated)
    if(result.ok)updated.calendarPublished=true
    setWorkspace(current=>({...current,openActions:(current.openActions||[]).map(item=>item.id===actionId?updated:item)}))
  }
  const stageCorrection=item=>{if(!item?.label||item.value==='')return;setWorkspace(current=>({...current,corrections:[{id:id('correction'),label:item.label,value:item.value,source:item.source||'Proposed',scope:item.scope||'this occurrence',reason:item.reason||'',status:'proposed',createdAt:new Date().toISOString(),cadence},...(current.corrections||[])]}))}
  const addCorrection=()=>{if(!correction.label.trim()||correction.value==='')return;stageCorrection(correction);setCorrection({label:'',value:'',source:'User Confirmed',scope:'this occurrence'})}
  const approveCorrection=correctionId=>setWorkspace(current=>({...current,corrections:(current.corrections||[]).map(item=>item.id===correctionId?{...item,status:'approved',approvedAt:new Date().toISOString()}:item)}))

  const analyze=async()=>{if(!transcript.trim())return;setAiBusy(true);setAiError('');try{const result=await analyzeMeetingTranscript({transcript,cadence,snapshot,notes});setAiSummary(result.summary||'');(result.actions||[]).forEach(item=>addAction(item));(result.decisions||[]).forEach(item=>addAction({text:item.text,owner:'',due:'',financialEffect:''}));(result.corrections||[]).forEach(stageCorrection);if((result.unresolved||[]).length)setNotes(current=>`${current}${current?'\n\n':''}Unresolved: ${(result.unresolved||[]).join(' · ')}`)}catch(error){setAiError(error.message||'Brevity could not reconcile this meeting.')}finally{setAiBusy(false)}}
  const finalize=()=>{
    const unpublished=(workspace.openActions||[]).filter(item=>!item.calendarPublished)
    const publishedIds=new Set()
    unpublished.forEach(item=>{if(syncMeetingActionToCalendar(localStorage,item).ok)publishedIds.add(item.id)})
    const record={id:id('meeting'),cadence,startedAt:startedAt||new Date().toISOString(),endedAt:new Date().toISOString(),summary:aiSummary,notes,transcript}
    setWorkspace(current=>({...current,openActions:(current.openActions||[]).map(item=>publishedIds.has(item.id)?{...item,calendarPublished:true}:item),meetings:[record,...(current.meetings||[])]}))
    setShowReconcile(false);setStartedAt(null);setAiSummary('');setTranscript('');setNotes('')
  }

  const weeklyRisk=Number(snapshot.weekObligations||0)>(Number(snapshot.operatingAvailable||0)+Number(snapshot.weekInflows||0))?'red':Number(snapshot.operatingAvailable||0)<Number(snapshot.weekObligations||0)?'yellow':'green'
  const dailyRisk=Number(snapshot.todayObligations||0)>(Number(snapshot.operatingAvailable||0)+Number(snapshot.todayInflows||0))?'red':Number(snapshot.operatingAvailable||0)<Number(snapshot.todayObligations||0)?'yellow':'green'
  const visionNet=visionMode==='projected'?Number(snapshot.projectedMonthlyNet||0):Number(snapshot.actualMonthlyNet||snapshot.currentMonthlyNet||0)
  const visionDrilldown=visionMode==='projected'?drilldowns.projectedMonthlyNet:drilldowns.actualMonthlyNet||drilldowns.currentMonthlyNet
  const visionGap=Math.max(Number(snapshot.goalMonthlyNet||0)-visionNet,0)
  const visionLabel=visionMode==='projected'?'Projected monthly net':'Actual monthly net'
  const openActions=(workspace.openActions||[]).filter(item=>item.status!=='done')
  const goalDrilldown={label:'Monthly net cash-flow vision',amount:snapshot.goalMonthlyNet,note:'Household vision target. This is a goal, not a calculated transaction total.',source:'Household financial vision',children:[]}
  const gapDrilldown={label:`Gap to monthly vision · ${visionMode==='projected'?'Projected':'Actual'}`,amount:visionGap,note:`Target monthly net cash flow minus ${visionMode} monthly net cash flow.`,source:'Vision target + finance data',children:[{label:'Vision target',amount:snapshot.goalMonthlyNet},{label:visionLabel,amount:visionNet,children:visionDrilldown?.children||[]} ]}
  const commitmentsDrilldown={label:'Open commitments',amount:openActions.length,note:'Assignments remain open until completed.',source:'Finance Meetings',children:openActions.map(item=>({label:item.text,amount:0,meta:`${item.owner||'Family'} · ${item.due||item.meetingDate||'Meeting date'}`}))}
  const agenda=useMemo(()=>cadence==='monthly'?[['Vision','Are we closer to the household financial vision?'],['Performance','Did we finish cash-flow positive or negative, and why?'],['Forecast','What must be covered during the next 30–90 days?'],['Priorities','What three decisions matter most next month?']]:cadence==='quarterly'?[['Trajectory','Are income, reserves, debt and spending moving in the right direction?'],['Strategy','What materially changed this quarter?'],['Reallocation','What receives more money, less money, or no money next quarter?'],['Commitments','What three priorities define the next quarter?']]:[['Close','What did we earn, spend, save and eliminate this year?'],['Vision','How did actual results compare with the annual plan?'],['Direction','What are next year’s income, cash-flow, savings and debt targets?'],['Plan','What must be true to accomplish the next-year vision?']],[cadence])

  const visionToggle=<div className="fm-vision-toggle" role="group" aria-label="Vision calculation"><button type="button" className={visionMode==='actual'?'active':''} onClick={()=>setVisionMode('actual')}>Actual</button><button type="button" className={visionMode==='projected'?'active':''} onClick={()=>setVisionMode('projected')}>Projected</button></div>

  return <section className={`finance-meetings${isRecording?' is-recording':''}`}>
    <header className="fm-header"><div><p className="fm-eyebrow">Finance · Meetings</p><h1>Financial Operating Rhythm</h1><p>{JOBS[cadence]}</p><small className="fm-data-scope">Data scope: {accountScope}</small></div><div className="fm-header-actions">{isRecording?<button className="fm-stop" onClick={endMeeting}><span className="fm-record-dot"/> End Meeting</button>:<button className="fm-primary" onClick={startMeeting}><i className="ti ti-microphone"/> Start Meeting</button>}</div></header>
    <nav className="fm-tabs">{CADENCES.map(item=><button key={item} className={cadence===item?'active':''} onClick={()=>setCadence(item)} disabled={isRecording}>{LABELS[item]}</button>)}</nav>
    {isRecording&&<div className="fm-recording-banner"><div><span className="fm-record-dot"/><strong>Recording is sacred</strong><span>One microphone stream feeds the uninterrupted master recording and Brevity transcription.</span></div><span>{transcribing?'Transcribing…':'Recording + transcription healthy'}</span></div>}
    {commandNotice&&<div className="fm-command-notice"><i className="ti ti-sparkles"/><span>{commandNotice}</span><button onClick={()=>setCommandNotice('')}><i className="ti ti-x"/></button></div>}

    <div className="fm-kiss-grid">
      {cadence==='daily'?<>
        <article className="fm-kiss-card"><span className="fm-step">01</span><h2>Vision</h2><p>Keep today connected to the $50K monthly net-cash-flow target.</p>{visionToggle}<button type="button" className="fm-big-number fm-big-number--clickable" onClick={()=>setDrilldown(goalDrilldown)}>{money(snapshot.goalMonthlyNet)}<i className="ti ti-chevron-right"/></button><div className="fm-metrics"><Metric label={visionLabel} value={money(visionNet)} onClick={()=>setDrilldown(visionDrilldown)}/><Metric label="Gap to vision" value={money(visionGap)} onClick={()=>setDrilldown(gapDrilldown)}/></div></article>
        <article className="fm-kiss-card"><span className="fm-step">02</span><h2>Cash</h2><p>What cash is actually available in the selected account scope?</p><div className="fm-metrics"><Metric label="Available cash" value={money(snapshot.operatingAvailable)} tone={dailyRisk} onClick={()=>setDrilldown(drilldowns.operatingAvailable)}/><Metric label="Current balance" value={money(snapshot.operatingBalance)} onClick={()=>setDrilldown(drilldowns.operatingBalance)}/></div><div className={`fm-status fm-status--${dailyRisk}`}>{dailyRisk==='red'?'Immediate cash action required':dailyRisk==='yellow'?'Watch today’s obligations':'Today’s cash coverage looks safe'}</div></article>
        <article className="fm-kiss-card"><span className="fm-step">03</span><h2>Today</h2><p>Only the cash movements that can change today’s decision.</p><div className="fm-metrics"><Metric label="Expected inflows" value={money(snapshot.todayInflows)} onClick={()=>setDrilldown(drilldowns.todayInflows)}/><Metric label="Due today / tomorrow" value={money(snapshot.todayObligations)} onClick={()=>setDrilldown(drilldowns.todayObligations)}/><Metric label="Approved discretionary" value={money(snapshot.approvedDiscretionary)} onClick={()=>setDrilldown(drilldowns.approvedDiscretionary)}/></div></article>
        <article className="fm-kiss-card"><span className="fm-step">04</span><h2>Commitments</h2><p>One owner and one completion time per action.</p><button type="button" className="fm-big-number fm-big-number--clickable" onClick={()=>setDrilldown(commitmentsDrilldown)}>{openActions.length}<i className="ti ti-chevron-right"/></button><small>{openActions.length?'Open commitments carried forward until completed and published to the Family Calendar.':'No open commitments.'}</small>{openActions.slice(0,3).map(item=><Action key={item.id} item={item} onToggle={toggleAction}/>)}</article>
      </>:cadence==='weekly'?<>
        <article className="fm-kiss-card"><span className="fm-step">01</span><h2>Vision</h2><p>Target monthly net cash flow</p>{visionToggle}<button type="button" className="fm-big-number fm-big-number--clickable" onClick={()=>setDrilldown(goalDrilldown)}>{money(snapshot.goalMonthlyNet)}<i className="ti ti-chevron-right"/></button><div className="fm-metrics"><Metric label={visionLabel} value={money(visionNet)} onClick={()=>setDrilldown(visionDrilldown)}/><Metric label="Gap to vision" value={money(visionGap)} onClick={()=>setDrilldown(gapDrilldown)}/></div></article>
        <article className="fm-kiss-card"><span className="fm-step">02</span><h2>This Week</h2><div className="fm-metrics"><Metric label="Available cash" value={money(snapshot.operatingAvailable)} tone={weeklyRisk} onClick={()=>setDrilldown(drilldowns.operatingAvailable)}/><Metric label="Expected inflows" value={money(snapshot.weekInflows)} onClick={()=>setDrilldown(drilldowns.weekInflows)}/><Metric label="Obligations" value={money(snapshot.weekObligations)} onClick={()=>setDrilldown(drilldowns.weekObligations)}/></div><div className={`fm-status fm-status--${weeklyRisk}`}>{weeklyRisk==='red'?'Action required':weeklyRisk==='yellow'?'Watch cash closely':'Cash coverage looks safe'}</div></article>
        <article className="fm-kiss-card"><span className="fm-step">03</span><h2>This Month</h2><p>Projected month-end net cash flow</p><Metric label="Month-end forecast" value={money(snapshot.monthForecast)} onClick={()=>setDrilldown(drilldowns.monthForecast)}/><select value={snapshot.monthStatus} onChange={event=>updateSnapshot('monthStatus',event.target.value)}><option value="green">Green — obligations covered</option><option value="yellow">Yellow — decisions required</option><option value="red">Red — shortfall projected</option></select><div className={`fm-status fm-status--${snapshot.monthStatus}`}>{snapshot.monthStatus==='green'?'Protect the plan':snapshot.monthStatus==='yellow'?'Move discretionary spend before savings':'Resolve shortfall before new spending'}</div></article>
        <article className="fm-kiss-card"><span className="fm-step">04</span><h2>Cut the Waste</h2><p>Review only the expenses big enough to change a decision.</p><textarea value={snapshot.expenseFocus} onChange={event=>updateSnapshot('expenseFocus',event.target.value)} rows="4"/><small>Every recurring expense must earn its place every month.</small></article>
      </>:agenda.map(([title,question],index)=><article className="fm-kiss-card" key={title}><span className="fm-step">0{index+1}</span><h2>{title}</h2><p>{question}</p><textarea rows="4" value={workspace.cadenceNotes?.[cadence]?.[index]||''} onChange={event=>updateCadenceNote(index,event.target.value)} placeholder="Capture only what changes a decision…"/></article>)}
    </div>

    <section className="fm-workbench"><div className="fm-panel"><div className="fm-panel-title"><div><span>Decisions & Assignments</span><small>Assignments publish to the Family Calendar automatically</small></div><i className="ti ti-list-check"/></div><div className="fm-form-grid"><input value={decision.text} onChange={event=>setDecision(value=>({...value,text:event.target.value}))} placeholder="What did we decide?"/><input value={decision.owner} onChange={event=>setDecision(value=>({...value,owner:event.target.value}))} placeholder="Owner (optional — Family if blank)"/><input type="date" value={decision.due} onChange={event=>setDecision(value=>({...value,due:event.target.value}))}/><button onClick={addDecision}>Add + Calendar</button></div><div className="fm-action-list">{(workspace.openActions||[]).length?(workspace.openActions||[]).map(item=><Action key={item.id} item={item} onToggle={toggleAction}/>):<p className="fm-empty">No open commitments.</p>}</div></div>
      <div className="fm-panel"><div className="fm-panel-title"><div><span>Financial Corrections</span><small>AI proposes. Humans approve financial truth.</small></div><i className="ti ti-adjustments"/></div><div className="fm-correction-grid"><input value={correction.label} onChange={event=>setCorrection(value=>({...value,label:event.target.value}))} placeholder="What changed?"/><input value={correction.value} onChange={event=>setCorrection(value=>({...value,value:event.target.value}))} placeholder="Correct value"/><select value={correction.source} onChange={event=>setCorrection(value=>({...value,source:event.target.value}))}>{SOURCE_STATES.map(source=><option key={source}>{source}</option>)}</select><select value={correction.scope} onChange={event=>setCorrection(value=>({...value,scope:event.target.value}))}><option>this occurrence</option><option>going forward</option><option>underlying data is wrong</option></select><button onClick={addCorrection}>Stage correction</button></div>{(workspace.corrections||[]).slice(0,8).map(item=><article className="fm-correction-row" key={item.id}><div><strong>{item.label}: {item.value}</strong><span>{item.source} · {item.scope}</span></div><button disabled={item.status==='approved'} onClick={()=>approveCorrection(item.id)}>{item.status==='approved'?'Approved':'Approve'}</button></article>)}</div></section>

    <section className="fm-capture"><div className="fm-panel-title"><div><span>Meeting Capture</span><small>Live transcript uses the same microphone stream as the master recording.</small></div><div className="fm-capture-actions"><button onClick={()=>fileRef.current?.click()}><i className="ti ti-file-upload"/> Import Otter</button><input ref={fileRef} type="file" accept=".txt,.vtt,.srt,text/plain,text/vtt" onChange={importTranscript} hidden/>{masterChunks.current.length>0&&<button onClick={saveRecording}><i className="ti ti-download"/> Save recording</button>}<button onClick={analyze} disabled={aiBusy||!transcript.trim()}><i className="ti ti-sparkles"/> {aiBusy?'Analyzing…':'Analyze with Brevity'}</button></div></div>{aiError&&<div className="fm-ai-error">{aiError}</div>}{aiSummary&&<div className="fm-ai-summary"><strong>Brevity summary</strong><p>{aiSummary}</p></div>}<textarea className="fm-transcript" value={transcript} onChange={event=>setTranscript(event.target.value)} rows="9" placeholder="Live transcription appears here. You can also paste or import an Otter transcript."/><textarea className="fm-notes" value={notes} onChange={event=>setNotes(event.target.value)} rows="3" placeholder="Optional meeting notes or unresolved context…"/></section>

    {showReconcile&&<section className="fm-reconcile"><div><p className="fm-eyebrow">Meeting Reconciliation</p><h2>Approve what Brevity should remember.</h2><p>Run Brevity analysis, review the extracted actions and staged financial corrections, then approve the meeting. Approved assignments are published to the Family Calendar. Bank history is never overwritten by meeting speech.</p></div><div className="fm-reconcile-actions"><button onClick={()=>setShowReconcile(false)}>Keep reviewing</button><button onClick={analyze} disabled={aiBusy||!transcript.trim()}>Analyze first</button><button className="fm-primary" onClick={finalize}>Approve Meeting Updates</button></div></section>}
    {(workspace.meetings||[]).length>0&&<section className="fm-history"><div className="fm-panel-title"><div><span>Meeting History</span><small>Institutional memory for the household</small></div></div>{workspace.meetings.slice(0,6).map(item=><article key={item.id}><div><strong>{LABELS[item.cadence]} Finance Meeting</strong><span>{new Date(item.endedAt).toLocaleString()}</span></div><small>{item.summary||item.notes||'Meeting captured and reconciled.'}</small></article>)}</section>}
    <MetricDrilldown node={drilldown} onClose={()=>setDrilldown(null)}/>
  </section>
}
