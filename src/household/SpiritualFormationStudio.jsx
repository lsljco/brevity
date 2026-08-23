import { useEffect, useMemo, useRef, useState } from 'react'
import { archiveSermonDocuments, generateSermonFormation, generateSermonSlides, getOneDriveStatus, getSermonSlideStatus, importSermonNotes, oneDriveConnectUrl } from './sermonFormationApi.js'
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
  const [archiveState,setArchiveState]=useState('idle')
  const [archiveError,setArchiveError]=useState('')
  const [archivedDocument,setArchivedDocument]=useState(existingSource.document||null)
  const [oneDrive,setOneDrive]=useState({loading:true,configured:false,connected:false,connection:null,error:''})
  const [slides,setSlides]=useState(existingSource.slideDeck||{state:'not-started'})
  const fileRef=useRef(null)
  const notesFileRef=useRef(null)

  const hasGenerated=Boolean(spiritual.sermonNotes)
  useEffect(()=>{getOneDriveStatus().then(status=>setOneDrive({...status,loading:false,error:''})).catch(err=>setOneDrive(current=>({...current,loading:false,error:err.message||'Could not check OneDrive.'})))},[])
  useEffect(()=>{if(slides.state!=='generating'||!slides.id)return;const timer=setInterval(()=>{getSermonSlideStatus(slides.id).then(status=>{setSlides(current=>({...current,...status,id:slides.id}));if(status.state==='ready')update('spiritual',{sermonNotes:spiritual.sermonNotes,sermonSource:{...existingSource,document:archivedDocument,slideDeck:{...status,id:slides.id}}})}).catch(err=>setSlides({state:'error',id:slides.id,error:err.message}))},4000);return()=>clearInterval(timer)},[slides.state,slides.id])
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
    setState('loading');setError('')
    try{
      const result=await generateSermonFormation({transcript,sermonDate,serviceType,title,targetDate:draft.date,sourceKind})
      const source={sermonDate,serviceType,title:result.sermonNotes?.documentTitle||result.sermonNotes?.title||title,fileName,sourceKind,generatedAt:result.generatedAt,model:result.model}
      update('spiritual',{
        owner:'Lorenzo',
        scripture:toLines(result.formation.scripture),
        devotionFocus:result.formation.devotionFocus||'',
        prayerFocus:toLines(result.formation.prayerFocus),
        discussionPrompts:toLines(result.formation.discussionPrompts),
        obedienceAction:result.formation.obedienceAction||'',
        todayFocus:result.formation.todayFocus||'',
        keyPrinciple:result.formation.keyPrinciple||'',
        formationEmphasis:result.formation.formationEmphasis||'',
        weeklyAssignment:result.formation.weeklyAssignment||'',
        sermonNotes:result.sermonNotes,
        sermonSource:source
      })
      setArchiveState('saving');setArchiveError('')
      try{
        const archived=await archiveSermonDocuments({notes:result.sermonNotes,source})
        setArchivedDocument(archived.document);setArchiveState('ready');if(archived.document?.oneDrive?.state==='error')setArchiveError(`Brevity saved both files, but OneDrive reported: ${archived.document.oneDrive.error}`)
        update('spiritual',{sermonNotes:result.sermonNotes,sermonSource:{...source,document:archived.document}})
      }catch(archiveErr){
        setArchiveState('error');setArchiveError(`${archiveErr.message||'Documents could not be archived.'} The generated notes remain saved in Brevity.`)
      }
      setState('ready')
    }catch(err){
      setState('error');setError(err.message||'Could not create sermon notes and spiritual formation.')
    }
  }

  const archiveCurrent=async()=>{
    if(!spiritual.sermonNotes)return
    setArchiveState('saving');setArchiveError('')
    try{
      const source={...existingSource,sermonDate:existingSource.sermonDate||sermonDate,serviceType:existingSource.serviceType||serviceType,title:spiritual.sermonNotes.documentTitle||spiritual.sermonNotes.title||title}
      const archived=await archiveSermonDocuments({notes:spiritual.sermonNotes,source})
      setArchivedDocument(archived.document);setArchiveState('ready');if(archived.document?.oneDrive?.state==='error')setArchiveError(`Brevity saved both files, but OneDrive reported: ${archived.document.oneDrive.error}`)
      update('spiritual',{sermonNotes:spiritual.sermonNotes,sermonSource:{...source,document:archived.document}})
    }catch(err){setArchiveState('error');setArchiveError(err.message||'Documents could not be archived.')}
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

  const createSlides=async()=>{if(!spiritual.sermonNotes)return;const id=archivedDocument?.id||`sermon-${Date.now()}`;setSlides({state:'generating',id,completed:0,total:0});try{await generateSermonSlides({id,notes:spiritual.sermonNotes,source:{...existingSource,title:spiritual.sermonNotes.documentTitle||title}})}catch(err){setSlides({state:'error',id,error:err.message||'Could not start sermon slides.'})}}

  return <div className="spiritual-studio">
    <section className="sermon-source-card">
      <div className="sermon-source-heading">
        <div><span>Sermon Source</span><h3>{hasGenerated?'Active teaching':'Upload the Word that will govern the formation cycle'}</h3><p>{hasGenerated?`${sourceLabel}. This sermon will govern each new daily Spiritual Maturity devotion until you upload another sermon source.`:'Start with a transcript or sermon notes you already have. Brevity will populate the teaching framework and run the complete document and formation flow.'}</p></div>
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
      {error&&<div className="sermon-error">{error}</div>}
      <button type="button" className="sermon-generate" disabled={state==='loading'||state==='reading'} onClick={generate}><i className={`ti ${state==='loading'?'ti-loader-2':'ti-sparkles'}`}/> {state==='loading'?(transcript.length>120000?'Analyzing the complete sermon source in sections…':'Creating sermon notes and formation…'):hasGenerated?'Regenerate complete sermon flow':'Generate Sermon Notes + Daily Formation'}</button>
    </section>

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
        <div><span>Document Repository</span><strong>{archivedDocument?.oneDrive?.state==='published'?'PDF published to Sermon Notes · Word file published to Sermon Notes - Word Documents':archivedDocument?'Word and PDF saved in Brevity':'Save permanent Word and PDF copies'}</strong>{archivedDocument?.oneDrive?.devotions?.state==='published'&&<small className="sermon-cloud-ready"><i className="ti ti-cloud-check"/> Seven-Day Devotions published to Devotions.</small>}{archivedDocument?.oneDrive?.devotions?.state==='error'&&<small className="sermon-library-error">Seven-Day Devotions could not publish: {archivedDocument.oneDrive.devotions.error}</small>}{oneDrive.connected?<small className="sermon-cloud-ready"><i className="ti ti-cloud-check"/> Church Triumphant publishing connected{oneDrive.connection?.account?` · ${oneDrive.connection.account}`:''}. Daily devotion PDFs publish to Devotions.</small>:oneDrive.configured&&!oneDrive.loading?<small>Connect Church Triumphant OneDrive to publish every generated sermon automatically.</small>:null}{slides.state==='generating'&&<small className="sermon-cloud-ready"><i className="ti ti-photo"/> Creating photorealistic sermon slides{slides.total?` · ${slides.completed||0} of ${slides.total} images`:''}…</small>}{slides.oneDrive?.state==='published'&&<small className="sermon-cloud-ready"><i className="ti ti-cloud-check"/> PowerPoint published to Sermon Notes.</small>}{slides.oneDrive?.state==='error'&&<small>PowerPoint saved in Brevity, but OneDrive reported: {slides.oneDrive.error}</small>}{slides.state==='error'&&<small>{slides.error}</small>}{archiveError&&<small>{archiveError}</small>}</div>
        <div>{archivedDocument&&<><a href={archivedDocument.files.docx}><i className="ti ti-file-type-docx"/> Word</a><a href={archivedDocument.files.pdf}><i className="ti ti-file-type-pdf"/> PDF</a></>}{slides.state==='ready'&&<a href={slides.download}><i className="ti ti-file-type-ppt"/> PowerPoint</a>}{hasGenerated&&slides.state!=='ready'&&<button type="button" disabled={slides.state==='generating'} onClick={createSlides}><i className={`ti ${slides.state==='generating'?'ti-loader-2':'ti-presentation'}`}/> {slides.state==='generating'?'Creating slides…':'Create sermon slides'}</button>}{archivedDocument?.oneDrive?.folderWebUrl&&<a href={archivedDocument.oneDrive.folderWebUrl} target="_blank" rel="noreferrer"><i className="ti ti-brand-onedrive"/> OneDrive</a>}{oneDrive.configured&&!oneDrive.connected&&<a className="sermon-connect-cloud" href={oneDriveConnectUrl}><i className="ti ti-brand-microsoft"/> Connect OneDrive</a>}<button type="button" disabled={archiveState==='saving'} onClick={archiveCurrent}><i className={`ti ${archiveState==='saving'?'ti-loader-2':'ti-device-floppy'}`}/> {archiveState==='saving'?'Saving…':archivedDocument?'Update documents':'Save documents'}</button></div>
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
