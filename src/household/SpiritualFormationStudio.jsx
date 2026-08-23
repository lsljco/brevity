import { useMemo, useRef, useState } from 'react'
import { archiveSermonDocuments, generateSermonFormation } from './sermonFormationApi.js'
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
  const [serviceType,setServiceType]=useState(existingSource.serviceType||'Sunday')
  const [sermonDate,setSermonDate]=useState(existingSource.sermonDate||draft.date||'')
  const [title,setTitle]=useState(existingSource.title||'')
  const [state,setState]=useState('idle')
  const [error,setError]=useState('')
  const [archiveState,setArchiveState]=useState('idle')
  const [archiveError,setArchiveError]=useState('')
  const [archivedDocument,setArchivedDocument]=useState(existingSource.document||null)
  const fileRef=useRef(null)

  const hasGenerated=Boolean(spiritual.sermonNotes)
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
      setTranscript(await file.text());setFileName(file.name);setError('')
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
      const result=await generateSermonFormation({transcript,sermonDate,serviceType,title,targetDate:draft.date})
      const source={sermonDate,serviceType,title:result.sermonNotes?.documentTitle||result.sermonNotes?.title||title,fileName,generatedAt:result.generatedAt,model:result.model}
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
        setArchivedDocument(archived.document);setArchiveState('ready')
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
      setArchivedDocument(archived.document);setArchiveState('ready')
      update('spiritual',{sermonNotes:spiritual.sermonNotes,sermonSource:{...source,document:archived.document}})
    }catch(err){setArchiveState('error');setArchiveError(err.message||'Documents could not be archived.')}
  }

  const clearSource=()=>{
    setTranscript('');setFileName('');setTitle('');setError('');setState('idle')
    if(fileRef.current) fileRef.current.value=''
  }

  return <div className="spiritual-studio">
    <section className="sermon-source-card">
      <div className="sermon-source-heading">
        <div><span>Sermon Source</span><h3>{hasGenerated?'Active teaching':'Upload the Word that will govern the formation cycle'}</h3><p>{hasGenerated?sourceLabel:'Brevity will create sermon notes, then derive daily Spiritual Maturity content from that message.'}</p></div>
        {hasGenerated&&<div className="sermon-status"><i className="ti ti-circle-check"/> Generated</div>}
      </div>
      <div className="sermon-source-meta">
        <label><span>Service</span><select value={serviceType} onChange={e=>setServiceType(e.target.value)}><option>Sunday</option><option>Wednesday</option><option>Other</option></select></label>
        <label><span>Sermon date</span><input type="date" value={sermonDate} onChange={e=>setSermonDate(e.target.value)}/></label>
        <label className="sermon-title-field"><span>Title, optional</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Brevity can identify it from the transcript"/></label>
      </div>
      <div className="transcript-actions">
        <input ref={fileRef} className="transcript-file-input" type="file" accept=".txt,.md,.markdown,.vtt,.srt,text/plain,text/markdown,text/vtt" onChange={chooseFile}/>
        <button type="button" className="transcript-upload" onClick={()=>fileRef.current?.click()}><i className="ti ti-upload"/> {fileName?'Replace transcript':'Upload transcript'}</button>
        {fileName&&<span className="transcript-filename"><i className="ti ti-file-text"/> {fileName}</span>}
        {(fileName||transcript)&&<button type="button" className="transcript-clear" onClick={clearSource}>Clear</button>}
      </div>
      <details className="transcript-paste" open={!fileName&&!hasGenerated}>
        <summary>Paste transcript instead</summary>
        <textarea value={transcript} onChange={e=>setTranscript(e.target.value)} placeholder="Paste the Sunday or Wednesday sermon transcript here…"/>
      </details>
      {error&&<div className="sermon-error">{error}</div>}
      <button type="button" className="sermon-generate" disabled={state==='loading'} onClick={generate}><i className={`ti ${state==='loading'?'ti-loader-2':'ti-sparkles'}`}/> {state==='loading'?(transcript.length>120000?'Analyzing the complete transcript in sections…':'Creating sermon notes and formation…'):hasGenerated?'Regenerate from transcript':'Generate Sermon Notes + Daily Formation'}</button>
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
        <div><span>Document Repository</span><strong>{archivedDocument?'Word and PDF saved':'Save permanent Word and PDF copies'}</strong>{archiveError&&<small>{archiveError}</small>}</div>
        <div>{archivedDocument&&<><a href={archivedDocument.files.docx}><i className="ti ti-file-type-docx"/> Word</a><a href={archivedDocument.files.pdf}><i className="ti ti-file-type-pdf"/> PDF</a></>}<button type="button" disabled={archiveState==='saving'} onClick={archiveCurrent}><i className={`ti ${archiveState==='saving'?'ti-loader-2':'ti-device-floppy'}`}/> {archiveState==='saving'?'Saving…':archivedDocument?'Update documents':'Save documents'}</button></div>
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
