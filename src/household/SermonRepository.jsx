import { useEffect, useState } from 'react'
import { archiveSermonDocuments, getOneDriveStatus, listSermonDocuments, oneDriveConnectUrl } from './sermonFormationApi.js'
import SermonNotesView from './SermonNotesView.jsx'
import './SpiritualFormationStudio.css'

export default function SermonRepository({notes,source}){
  const [documents,setDocuments]=useState([])
  const [state,setState]=useState('loading')
  const [error,setError]=useState('')
  const [oneDrive,setOneDrive]=useState({loading:true,configured:false,connected:false,connection:null,error:''})
  const [publishState,setPublishState]=useState('idle')
  const [publishMessage,setPublishMessage]=useState('')

  useEffect(()=>{
    let live=true
    Promise.allSettled([listSermonDocuments(),getOneDriveStatus()]).then(([repository,cloud])=>{
      if(!live)return
      if(repository.status==='fulfilled'){setDocuments(repository.value.documents||[]);setState('ready')}else{setError(repository.reason?.message||'Could not load the sermon repository.');setState('error')}
      if(cloud.status==='fulfilled')setOneDrive({...cloud.value,loading:false,error:''})
      else setOneDrive(current=>({...current,loading:false,error:cloud.reason?.message||'Could not check OneDrive.'}))
    })
    return()=>{live=false}
  },[])

  const publishCurrent=async()=>{
    if(!notes)return
    setPublishState('saving');setPublishMessage('')
    try{
      const result=await archiveSermonDocuments({notes,source:source||{}})
      const document=result.document
      setDocuments(current=>[document,...current.filter(item=>item.id!==document.id)])
      if(document.oneDrive?.state==='published')setPublishMessage('Published the PDF to Sermon Notes and the Word file to Sermon Notes - Word Documents.')
      else if(document.oneDrive?.state==='error')setPublishMessage(`Saved in Brevity, but OneDrive reported: ${document.oneDrive.error}`)
      else setPublishMessage('Saved in Brevity. Connect OneDrive to publish the Church Triumphant copies.')
      setPublishState('ready')
    }catch(err){setPublishState('error');setPublishMessage(err.message||'Could not publish the sermon documents.')}
  }
  const changeRepository=()=>{const folderUrl=window.prompt('Paste the sharing link for the Church Triumphant folder in the lsljco@icloud.com OneDrive.');if(folderUrl?.trim())window.location.assign(oneDriveConnectUrl(folderUrl.trim()))}

  return <section className="pillar-analysis-section sermon-repository">
    <div className="pillar-analysis-heading"><span>Teaching Repository</span><h2>Permanent Sermon Notes</h2><p>Detailed teaching documents generated from sermon transcripts and retained as Word and PDF files.</p></div>
    <div className="sermon-cloud-panel">
      <div><span>Church Triumphant OneDrive</span><strong>{oneDrive.loading?'Checking connection…':oneDrive.connected?'Connected for organized Church Triumphant publishing':'Connect the shared Sermon Notes folder'}</strong>{oneDrive.connected&&<small>PDFs → Sermon Notes · Word files → Sermon Notes - Word Documents · Daily devotions → Devotions<br/>{oneDrive.connection?.account}</small>}{oneDrive.error&&<small className="sermon-library-error">{oneDrive.error}</small>}{publishMessage&&<small className={publishState==='error'?'sermon-library-error':''}>{publishMessage}</small>}</div>
      <div>{oneDrive.configured&&!oneDrive.connected&&<button type="button" className="sermon-connect-cloud" onClick={changeRepository}><i className="ti ti-brand-microsoft"/> Connect OneDrive</button>}{oneDrive.connected&&oneDrive.connection?.folderWebUrl&&<a href={oneDrive.connection.folderWebUrl} target="_blank" rel="noreferrer"><i className="ti ti-brand-onedrive"/> Open folder</a>}{oneDrive.configured&&<button type="button" onClick={changeRepository}><i className="ti ti-switch-horizontal"/> {oneDrive.connected?'Change repository':'Choose repository'}</button>}{notes&&<button type="button" disabled={publishState==='saving'||!oneDrive.connected} onClick={publishCurrent}><i className={`ti ${publishState==='saving'?'ti-loader-2':'ti-cloud-upload'}`}/> {publishState==='saving'?'Publishing…':'Publish current sermon'}</button>}</div>
    </div>
    {source?.document&&<div className="sermon-current-downloads"><strong>{source.document.title}</strong><span><a href={source.document.files.docx}>Download Word</a><a href={source.document.files.pdf}>Download PDF</a></span></div>}
    {notes?<details className="sermon-notes-panel" open><summary><span>{notes.documentTitle||notes.title||'Current Teaching'}</span><small>Read detailed notes</small></summary><SermonNotesView notes={notes}/></details>:<p className="pillar-analysis-empty">Upload a sermon transcript during Morning Alignment to create the first detailed teaching document.</p>}
    <div className="sermon-library-list"><h3>Repository Files</h3>{state==='loading'&&<p>Loading documents…</p>}{error&&<p className="sermon-library-error">{error}</p>}{state==='ready'&&!documents.length&&<p>No archived documents yet.</p>}{documents.map(document=><article key={document.id}><div><strong>{document.title}</strong><small>{[document.serviceType,document.sermonDate,document.preacherTeacher].filter(Boolean).join(' · ')}</small>{document.oneDrive?.state==='published'&&<small className="sermon-cloud-ready"><i className="ti ti-cloud-check"/> OneDrive</small>}</div><span><a href={document.files.docx}>Word</a><a href={document.files.pdf}>PDF</a></span></article>)}</div>
  </section>
}
