import { useEffect, useMemo, useRef, useState } from 'react'
import { archiveSermonDocuments, clearPendingSermonAnalysis, generateSermonFormation, generateSermonSlides, getOneDriveStatus, getPendingSermonAnalysis, getSermonSlideStatus, importSermonNotes, ONEDRIVE_REPOSITORY_SHARE_URL, prepareSermonActivation, resumeSermonFormation } from './sermonFormationApi.js'
import { ACTION_COMPLETED_EVENT, requestActionReview } from '../assistant/actionEvents.js'
import { joinEditableLines, splitEditableLines } from './lineEditing.js'
import SermonNotesView from './SermonNotesView.jsx'
import './SpiritualFormationStudio.css'

const toLines=value=>Array.isArray(value)?value:splitEditableLines(String(value||''))
const joinLines=value=>joinEditableLines(Array.isArray(value)?value:[])

export default function SpiritualFormationStudio({draft,update}){
  const spiritual=draft.spiritual||{}
  const existingSource=spiritual.sermonSource||{}
  const [transcript,setTranscript]=useState('')
  const [fileName,setFileName]=useState(existingSource.fileName||'')
  const [sourceKind,setSourceKind]=useState(existingSource.sourceKind||'transcript')
  const [serviceType,setServiceType]=useState(existingSource.serviceType||'Sunday')
  const [sermonDate,setSermonDate]=useState(existingSource.sermonDate||draft.date||'')
  const [title,setTitle]=useState(existingSource.title||'')
  const [state,setState]=useState('idle')
  const [error,setError]=useState('')
  const [candidate,setCandidate]=useState(null)
  const [pendingAnalysis,setPendingAnalysis]=useState(()=>getPendingSermonAnalysis())
  const [activationState,setActivationState]=useState('idle')
  const [activationError,setActivationError]=useState('')
  const [archiveState,setArchiveState]=useState('idle')
  const [archiveError,setArchiveError]=useState('')
  const [archivedDocument,setArchivedDocument]=useState(existingSource.document||null)
  const [oneDrive,setOneDrive]=useState({loading:true,configured:false,connected:false,connection:null,error:''})
  const [slides,setSlides]=useState(existingSource.slideDeck||{state:'not-started'})
  const fileRef=useRef(null)
  const notesFileRef=useRef(null)
  const analysisControllerRef=useRef(null)

  const hasGenerated=Boolean(spiritual.sermonNotes)
  const activeVersion=Number(existingSource.activeVersion||0)
  const activeSourceHash=String(existingSource.sourceHash||'')
  const reviewedActive=hasGenerated&&Number.isInteger(activeVersion)&&activeVersion>=1&&/^[a-f0-9]{64}$/.test(activeSourceHash)
  const acceptAnalysis=result=>{
    const context=result.resumeContext||{}
    const resolvedTitle=result.sermonNotes?.documentTitle||result.sermonNotes?.title||context.title||title
    const source={
      ...(result.source||{}),sermonDate:context.sermonDate||sermonDate,
      serviceType:context.serviceType||serviceType,title:resolvedTitle,
      fileName:context.fileName||fileName,sourceKind:context.sourceKind||sourceKind,
      generatedAt:result.generatedAt,model:result.model,sourceHash:result.sourceHash,
    }
    setCandidate({...result,source})
    setFileName(source.fileName||'');setSourceKind(source.sourceKind||'transcript');setServiceType(source.serviceType||'Sunday');setSermonDate(source.sermonDate||draft.date||'');setTitle(source.title||'')
    setPendingAnalysis(getPendingSermonAnalysis());setActivationState('idle');setActivationError('');setState('ready');setError('')
  }
  useEffect(()=>{getOneDriveStatus().then(status=>setOneDrive({...status,loading:false,error:''})).catch(err=>setOneDrive(current=>({...current,loading:false,error:err.message||'Could not check OneDrive.'})))},[])
  useEffect(()=>{if(slides.state!=='generating'||!slides.id)return;const timer=setInterval(()=>{getSermonSlideStatus(slides.id).then(status=>{setSlides(current=>({...current,...status,id:slides.id}));if(status.state==='ready')update('spiritual',{sermonNotes:spiritual.sermonNotes,sermonSource:{...existingSource,document:archivedDocument,slideDeck:{...status,id:slides.id}}})}).catch(err=>setSlides({state:'error',id:slides.id,error:err.message}))},4000);return()=>clearInterval(timer)},[slides.state,slides.id])
  useEffect(()=>{const completed=event=>{if(!event.detail?.audit?.affectedRecords?.some(change=>change.resource==='sermon:active'))return;clearPendingSermonAnalysis();setPendingAnalysis(null);setCandidate(null);setActivationState('applied');setActivationError('')};window.addEventListener(ACTION_COMPLETED_EVENT,completed);return()=>window.removeEventListener(ACTION_COMPLETED_EVENT,completed)},[])
  useEffect(()=>{
    if(!pendingAnalysis?.jobId)return
    const controller=new AbortController();analysisControllerRef.current=controller;setState('loading');setError('')
    resumeSermonFormation({signal:controller.signal}).then(result=>{if(!controller.signal.aborted)acceptAnalysis(result)}).catch(err=>{if(err?.name!=='AbortError'&&!controller.signal.aborted){setState('error');setError(err.message||'Could not resume the retained sermon analysis.');setPendingAnalysis(getPendingSermonAnalysis())}})
    return()=>controller.abort()
  },[])
  const sourceLabel=useMemo(()=>{
    if(!hasGenerated) return ''
    return [existingSource.serviceType,existingSource.sermonDate,existingSource.title].filter(Boolean).join(' · ')
  },[existingSource,hasGenerated])

  const chooseFile=async event=>{
    const file=event.target.files?.[0]
    if(!file) return
    if(!/\.(txt|md|markdown|vtt|srt)$/i.test(file.name)){
      setError('Upload a text transcript (.txt, .md, .vtt or .srt), or paste the transcript below.')
      event.target.value=''
      return
    }
    try{
      setTranscript(await file.text());setFileName(file.name);setSourceKind('transcript');setError('')
    }catch{
      setError('Brevity could not read that transcript file.')
    }
  }

  const generate=async()=>{
    if(!transcript.trim()){
      setError('Upload or paste a sermon transcript before generating the formation plan.')
      return
    }
    analysisControllerRef.current?.abort();const controller=new AbortController();analysisControllerRef.current=controller
    setState('loading');setError('')
    try{
      const result=await generateSermonFormation({transcript,sermonDate,serviceType,title,targetDate:draft.date,sourceKind,fileName,signal:controller.signal})
      if(!controller.signal.aborted)acceptAnalysis(result)
    }catch(err){
      if(err?.name!=='AbortError'&&!controller.signal.aborted){setState('error');setError(err.message||'Could not create sermon notes and spiritual formation.');setPendingAnalysis(getPendingSermonAnalysis())}
    }
  }

  const resumeAnalysis=async restart=>{
    analysisControllerRef.current?.abort();const controller=new AbortController();analysisControllerRef.current=controller
    setState('loading');setError('')
    try{const result=await resumeSermonFormation({restart,signal:controller.signal});if(!controller.signal.aborted)acceptAnalysis(result)}
    catch(err){if(err?.name!=='AbortError'&&!controller.signal.aborted){setState('error');setError(err.message||'Could not resume the retained sermon analysis.');setPendingAnalysis(getPendingSermonAnalysis())}}
  }
  const stopWaiting=()=>{analysisControllerRef.current?.abort();clearPendingSermonAnalysis();setPendingAnalysis(null);setState('idle');setError('Waiting stopped. The reviewed active sermon was not changed. You can analyze the uploaded source again when ready.')}

  const archiveCurrent=async()=>{
    if(!reviewedActive){setArchiveError('Review and activate this sermon before creating documents.');return}
    setArchiveState('saving');setArchiveError('')
    try{
      const archived=await archiveSermonDocuments({activeVersion,sourceHash:activeSourceHash})
      setArchivedDocument(archived.document);setArchiveState('ready')
      update('spiritual',{sermonNotes:spiritual.sermonNotes,sermonSource:{...existingSource,document:archived.document}})
    }catch(err){setArchiveState('error');setArchiveError(err.message||'Documents could not be archived.')}
  }

  const reviewCandidate=async()=>{
    if(!candidate?.draftId)return
    setActivationState('preparing');setActivationError('')
    try{
      const result=await prepareSermonActivation({draftId:candidate.draftId,sourceHash:candidate.sourceHash,expectedVersion:candidate.baseActiveVersion})
      if(!result?.proposal)throw new Error('Action Mode did not return a reviewable sermon-source proposal.')
      requestActionReview(result.proposal)
      setActivationState('reviewing')
    }catch(err){setActivationState('error');setActivationError(err.message||'Could not open sermon-source review.')}
  }

  const clearSource=()=>{
    setTranscript('');setFileName('');setTitle('');setSourceKind('transcript');setError('');setState('idle')
    if(fileRef.current) fileRef.current.value=''
    if(notesFileRef.current) notesFileRef.current.value=''
  }

  const chooseNotesFile=async event=>{
    const file=event.target.files?.[0]
    if(!file)return
    if(!/\.(docx|pdf|txt|md|markdown)$/i.test(file.name)){setError('Upload sermon notes as Word (.docx), PDF (.pdf), or text.');event.target.value='';return}
    setState('reading');setError('')
    try{
      const result=/\.(docx|pdf)$/i.test(file.name)?await importSermonNotes(file):{text:await file.text()}
      setTranscript(result.text);setFileName(file.name);setSourceKind('notes');setState('idle')
      const inferred=file.name.replace(/\.(docx|pdf|txt|md|markdown)$/i,'').replace(/^\d{2}[.-]\d{2}[.-]\d{4}\s*-\s*/,'').replace(/\s+Sermon(?:\s+Teaching)?\s+Guide$/i,'').trim()
      if(!title&&inferred)setTitle(inferred)
    }catch(err){setState('error');setError(err.message||'Brevity could not read those sermon notes.')}
  }

  const createSlides=async()=>{if(!reviewedActive||!archivedDocument?.id){setArchiveError('Create documents from the reviewed active sermon before creating slides.');return}const id=archivedDocument.id;setSlides({state:'generating',id,completed:0,total:0});try{await generateSermonSlides({id,activeVersion,sourceHash:activeSourceHash})}catch(err){setSlides({state:'error',id,error:err.message||'Could not start sermon slides.'})}}
  return <div className="spiritual-studio">
    <section className="sermon-source-card">
      <div className="sermon-source-heading">
        <div><span>Sermon Source</span><h3>{hasGenerated?'Active teaching':'Upload the Word that will govern the formation cycle'}</h3><p>{hasGenerated?`${sourceLabel}. This reviewed sermon remains active until a household member explicitly reviews and applies a replacement.`:'Start with a transcript or sermon notes you already have. Brevity will analyze it as a draft; the active teaching changes only after Action Mode review.'}</p></div>
        {hasGenerated&&<div className="sermon-status"><i className="ti ti-circle-check"/> Active source</div>}
      </div>
      <div className="sermon-source-meta">
        <label><span>Service</span><select value={serviceType} onChange={e=>setServiceType(e.target.value)}><option>Sunday</option><option>Wednesday</option><option>Other</option></select></label>
        <label><span>Sermon date</span><input type="date" value={sermonDate} onChange={e=>setSermonDate(e.target.value)}/></label>
        <label className="sermon-title-field"><span>Title, optional</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Brevity can identify it from the transcript"/></label>
      </div>
      <div className="transcript-actions">
        <input ref={fileRef} className="transcript-file-input" type="file" accept=".txt,.md,.markdown,.vtt,.srt,text/plain,text/markdown,text/vtt" onChange={chooseFile}/>
        <button type="button" className="transcript-upload" onClick={()=>fileRef.current?.click()}><i className="ti ti-upload"/> {fileName&&sourceKind==='transcript'?'Replace transcript':'Upload transcript'}</button>
        <input ref={notesFileRef} className="transcript-file-input" type="file" accept=".docx,.pdf,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={chooseNotesFile}/>
        <button type="button" className="transcript-upload" disabled={state==='reading'} onClick={()=>notesFileRef.current?.click()}><i className={`ti ${state==='reading'?'ti-loader-2':'ti-file-upload'}`}/> {state==='reading'?'Reading notes…':'Upload existing sermon notes'}</button>
        {fileName&&<span className="transcript-filename"><i className="ti ti-file-text"/> {fileName}</span>}
        {(fileName||transcript)&&<button type="button" className="transcript-clear" onClick={clearSource}>Clear</button>}
      </div>
      <details className="transcript-paste" open={!fileName&&!hasGenerated}>
        <summary>Paste transcript or sermon notes instead</summary>
        <textarea value={transcript} onChange={e=>{setTranscript(e.target.value);setSourceKind('transcript')}} placeholder="Paste the Sunday or Wednesday sermon transcript, or existing sermon notes, here…"/>
      </details>
      {error&&<div className="sermon-error" role="alert">{error}</div>}
      <button type="button" className="sermon-generate" disabled={state==='loading'||state==='reading'} onClick={generate}><i className={`ti ${state==='loading'?'ti-loader-2':'ti-sparkles'}`}/> {state==='loading'?'Analyzing a retained draft in the background…':hasGenerated?'Analyze replacement as draft':'Analyze Sermon Notes + Daily Formation'}</button>
      {state==='loading'&&<button type="button" className="transcript-clear" onClick={stopWaiting}>Stop waiting</button>}
      {state==='error'&&pendingAnalysis?.jobId&&<button type="button" className="transcript-upload" onClick={()=>resumeAnalysis(true)}><i className="ti ti-refresh"/> Retry retained analysis</button>}
    </section>

    {candidate&&<section className="sermon-candidate-card" aria-label="Sermon source awaiting review">
      <header><div><span>Draft — not active</span><h3>{candidate.sermonNotes?.documentTitle||candidate.sermonNotes?.title||candidate.source?.title||'Sermon-source candidate'}</h3><p>Brevity retained this analysis as a versioned candidate. The current sermon and daily formation remain unchanged until you approve the Action Mode confirmation.</p></div><strong><i className="ti ti-shield-check"/> Review required</strong></header>
      <dl><div><dt>Source</dt><dd>{[candidate.source?.serviceType,candidate.source?.sermonDate,candidate.source?.fileName].filter(Boolean).join(' · ')||'Uploaded sermon source'}</dd></div><div><dt>Source fingerprint</dt><dd>{String(candidate.sourceHash||'').slice(0,12)}…</dd></div><div><dt>Based on active version</dt><dd>v{Number(candidate.baseActiveVersion||0)}</dd></div></dl>
      <div className="sermon-candidate-preview"><span>Proposed Today focus</span><strong>{candidate.formation?.todayFocus||'Review the complete generated teaching before applying.'}</strong><p>{candidate.formation?.devotionFocus}</p></div>
      {activationError&&<div className="sermon-error" role="alert">{activationError}</div>}
      <button type="button" className="sermon-generate" disabled={activationState==='preparing'} onClick={reviewCandidate}><i className={`ti ${activationState==='preparing'?'ti-loader-2':'ti-shield-check'}`}/> {activationState==='preparing'?'Preparing review…':activationState==='reviewing'?'Reopen Action Mode review':'Review and activate this sermon'}</button>
      <details className="sermon-notes-panel"><summary><span>Preview candidate sermon notes</span><small>This preview cannot replace the active source.</small></summary><SermonNotesView notes={candidate.sermonNotes}/></details>
    </section>}

    {hasGenerated&&<>
      <section className="formation-summary">
        <div><span>Today’s Focus</span><h3>{spiritual.todayFocus}</h3><p>{spiritual.devotionFocus}</p></div>
        <aside><span>Formation Emphasis</span><strong>{spiritual.formationEmphasis||'—'}</strong><small>{spiritual.keyPrinciple}</small></aside>
      </section>
      <div className="formation-card-grid">
        <article><span>Scripture</span><ul>{toLines(spiritual.scripture).map((item,index)=><li key={`scripture-${index}`}>{item}</li>)}</ul></article>
        <article><span>Prayer Focus</span><ul>{toLines(spiritual.prayerFocus).map((item,index)=><li key={`prayer-${index}`}>{item}</li>)}</ul></article>
        <article><span>Act of Obedience</span><p>{spiritual.obedienceAction}</p></article>
        <article><span>Weekly Assignment</span><p>{spiritual.weeklyAssignment}</p></article>
      </div>
      <section className="sermon-document-actions">
        <div><span>Document Repository</span><strong>Reviewed Sermon Documents &amp; Media</strong>{archivedDocument?<small className="sermon-cloud-ready"><i className="ti ti-device-floppy"/> Files generated locally from active version {archivedDocument.activeVersion}.</small>:null}<small><i className="ti ti-lock"/> External publishing is disabled until it has its own reviewed, reversible workflow.</small>{oneDrive.connected&&<small>Existing repository connection detected{oneDrive.connection?.account?` · ${oneDrive.connection.account}`:''}; no files are uploaded automatically.</small>}{slides.state==='generating'&&<small className="sermon-cloud-ready"><i className="ti ti-photo"/> Creating photorealistic sermon slides{slides.total?` · ${slides.completed||0} of ${slides.total} images`:''}…</small>}{slides.state==='error'&&<small>{slides.error}</small>}{archiveError&&<small>{archiveError}</small>}</div>
        <div>{archivedDocument&&<>{archivedDocument.files?.docx&&<a href={archivedDocument.files.docx}><i className="ti ti-file-type-docx"/> Word</a>}{archivedDocument.files?.pdf&&<a href={archivedDocument.files.pdf}><i className="ti ti-file-type-pdf"/> PDF</a>}</>}{slides.state==='ready'&&<a href={slides.download}><i className="ti ti-file-type-ppt"/> PowerPoint</a>}{reviewedActive&&slides.state!=='ready'&&<button type="button" disabled={slides.state==='generating'||!archivedDocument?.id} onClick={createSlides}><i className={`ti ${slides.state==='generating'?'ti-loader-2':'ti-presentation'}`}/> {slides.state==='generating'?'Creating slides…':'Create sermon slides'}</button>}{oneDrive.configured&&!oneDrive.loading&&<button type="button" disabled title="External publishing and connection changes are disabled in this release."><i className="ti ti-lock"/> External publishing unavailable</button>}<a href={ONEDRIVE_REPOSITORY_SHARE_URL} target="_blank" rel="noreferrer"><i className="ti ti-brand-onedrive"/> Open repository</a><button type="button" disabled={archiveState==='saving'||!reviewedActive} onClick={archiveCurrent}><i className={`ti ${archiveState==='saving'?'ti-loader-2':'ti-device-floppy'}`}/> {archiveState==='saving'?'Creating…':archivedDocument?'Recreate local documents':'Create local documents'}</button></div>
      </section>
      <details className="sermon-notes-panel"><summary><span>Permanent Sermon Notes</span><small>Full Church Triumphant teaching-document framework</small></summary><SermonNotesView notes={spiritual.sermonNotes}/></details>
    </>}

    <details className="spiritual-manual-edit" open={!hasGenerated}>
      <summary><span>Manual edits</span><small>Use these fields when you want to override generated formation.</small></summary>
      <div className="alignment-form-grid">
        <label className="alignment-field"><span>Scripture</span><textarea value={joinLines(spiritual.scripture)} onChange={e=>update('spiritual',{scripture:toLines(e.target.value)})} placeholder="One passage per line"/></label>
        <label className="alignment-field"><span>Devotion focus</span><textarea value={spiritual.devotionFocus||''} onChange={e=>update('spiritual',{devotionFocus:e.target.value})}/></label>
        <label className="alignment-field"><span>Prayer focus</span><textarea value={joinLines(spiritual.prayerFocus)} onChange={e=>update('spiritual',{prayerFocus:toLines(e.target.value)})}/></label>
        <label className="alignment-field"><span>Act of obedience</span><textarea value={spiritual.obedienceAction||''} onChange={e=>update('spiritual',{obedienceAction:e.target.value})}/></label>
      </div>
    </details>
  </div>
}
