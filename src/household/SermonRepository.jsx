import { useEffect, useState } from 'react'
import { listSermonDocuments } from './sermonFormationApi.js'
import SermonNotesView from './SermonNotesView.jsx'
import './SpiritualFormationStudio.css'

export default function SermonRepository({notes,source}){
  const [documents,setDocuments]=useState([])
  const [state,setState]=useState('loading')
  const [error,setError]=useState('')
  useEffect(()=>{let live=true;listSermonDocuments().then(result=>{if(live){setDocuments(result.documents||[]);setState('ready')}}).catch(err=>{if(live){setError(err.message||'Could not load the sermon repository.');setState('error')}});return()=>{live=false}},[])
  return <section className="pillar-analysis-section sermon-repository">
    <div className="pillar-analysis-heading"><span>Teaching Repository</span><h2>Permanent Sermon Notes</h2><p>Detailed teaching documents generated from sermon transcripts and retained as Word and PDF files.</p></div>
    {source?.document&&<div className="sermon-current-downloads"><strong>{source.document.title}</strong><span><a href={source.document.files.docx}>Download Word</a><a href={source.document.files.pdf}>Download PDF</a></span></div>}
    {notes?<details className="sermon-notes-panel" open><summary><span>{notes.documentTitle||notes.title||'Current Teaching'}</span><small>Read detailed notes</small></summary><SermonNotesView notes={notes}/></details>:<p className="pillar-analysis-empty">Upload a sermon transcript during Morning Alignment to create the first detailed teaching document.</p>}
    <div className="sermon-library-list"><h3>Repository Files</h3>{state==='loading'&&<p>Loading documents…</p>}{error&&<p className="sermon-library-error">{error}</p>}{state==='ready'&&!documents.length&&<p>No archived documents yet.</p>}{documents.map(document=><article key={document.id}><div><strong>{document.title}</strong><small>{[document.serviceType,document.sermonDate,document.preacherTeacher].filter(Boolean).join(' · ')}</small></div><span><a href={document.files.docx}>Word</a><a href={document.files.pdf}>PDF</a></span></article>)}</div>
  </section>
}
