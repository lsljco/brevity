import { useMemo, useRef, useState } from 'react'
import { generateSermonFormation } from './sermonFormationApi.js'
import './SpiritualFormationStudio.css'

const NOTE_SECTIONS=[
  ['title','Title'],['scriptures','Scriptures'],['themes','Theme(s)'],['bigIdea','Big Idea'],['definition','Definition'],['coreRevelation','Core Revelation'],['foundationalTruths','Foundational Truths'],['whatThisProduces','What This Produces'],['applicationQuestions','Application Questions'],['call','Call'],['prayer','Prayer']
]

const toLines=value=>Array.isArray(value)?value:String(value||'').split('\n').map(v=>v.trim()).filter(Boolean)
const joinLines=value=>Array.isArray(value)?value.join('\n'):String(value||'')

function NotesView({notes}){
  if(!notes) return null
  return <div className="sermon-notes-grid">{NOTE_SECTIONS.map(([key,label])=>{
    const value=notes[key]
    return <article key={key} className="sermon-note-card"><span>{label}</span>{Array.isArray(value)?<ul>{value.map((item,index)=><li key={`${key}-${index}`}>{item}</li>)}</ul>:<p>{value||'—'}</p>}</article>
  })}</div>
}

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
  const fileRef=useRef(null)

  const hasGenerated=Boolean(spiritual.sermonNotes)
  const sourceLabel=useMemo(()=>{
    if(!hasGenerated) return ''
    const parts=[existingSource.serviceType,existingSource.sermonDate,existingSource.title].filter(Boolean)
    return parts.join(' · ')
  },[existingSource,hasGenerated])

  const chooseFile=async event=>{
    const file=event.target.files?.[0]
    if(!file) return
    const allowed=/\.(txt|md|markdown|vtt|srt)$/i.test(file.name)
    if(!allowed){
      setError('For this first release, upload a text transcript (.txt, .md, .vtt or .srt). You can also paste transcript text below.')
      event.target.value=''
      return
    }
    try{
      const text=await file.text()
      setTranscript(text)
      setFileName(file.name)
      setError('')
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
        sermonSource:{
          sermonDate,
          serviceType,
          title:result.sermonNotes?.title||title,
          fileName,
          generatedAt:result.generatedAt,
          model:result.model
        }
      })
      setState('ready')
    }catch(err){
      setState('error');setError(err.message||'Could not create sermon notes and spiritual formation.')
    }
  }

  const clearSource=()=>{
    setTranscript('');setFileName('');setTitle('');setError('');setState('idle')
    if(fileRef.current) fileRef.current.value=''
  }

  return <div className="spiritual-studio">
    <section className="sermon-source-card">
      <div className="sermon-source-heading">
        <div><span>Sermon Source</span><h3>{hasGenerated?'Active teaching':'Upload the Word that will govern the formation cycle'}</h3><p>{hasGenerated?sourceLabel:'Brevity will create your sermon notes first, then derive the daily Spiritual Maturity content from that message.'}</p></div>
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
      <button type="button" className="sermon-generate" disabled={state==='loading'} onClick={generate}><i className={`ti ${state==='loading'?'ti-loader-2':'ti-sparkles'}`}/> {state==='loading'?'Creating sermon notes and formation…':hasGenerated?'Regenerate from transcript':'Generate Sermon Notes + Daily Formation'}</button>
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

      <details className="sermon-notes-panel"><summary><span>Permanent Sermon Notes</span><small>11-section Church Triumphant framework</small></summary><NotesView notes={spiritual.sermonNotes}/></details>
    </>}

    <details className="spiritual-manual-edit" open={!hasGenerated}>
      <summary><span>Manual edits</span><small>Use only when you want to override Brevity’s generated formation.</small></summary>
      <div className="alignment-form-grid">
        <label className="alignment-field"><span>Scripture</span><textarea value={joinLines(spiritual.scripture)} onChange={e=>update('spiritual',{scripture:toLines(e.target.value)})} placeholder="One passage per line"/></label>
        <label className="alignment-field"><span>Devotion focus</span><textarea value={spiritual.devotionFocus||''} onChange={e=>update('spiritual',{devotionFocus:e.target.value})}/></label>
        <label className="alignment-field"><span>Prayer focus</span><textarea value={joinLines(spiritual.prayerFocus)} onChange={e=>update('spiritual',{prayerFocus:toLines(e.target.value)})}/></label>
        <label className="alignment-field"><span>Act of obedience</span><textarea value={spiritual.obedienceAction||''} onChange={e=>update('spiritual',{obedienceAction:e.target.value})}/></label>
      </div>
    </details>
  </div>
}
