import { useEffect, useState } from 'react'
import { archiveSermonDocuments, getOneDriveStatus, getSermonDeviceRescues, listSermonDocuments, ONEDRIVE_REPOSITORY_SHARE_URL, oneDriveConnectUrl } from './sermonFormationApi.js'
import SermonNotesView from './SermonNotesView.jsx'
import './SpiritualFormationStudio.css'

export default function SermonRepository({notes,source}){
  const [documents,setDocuments]=useState([])
  const [recovered,setRecovered]=useState([])
  const [state,setState]=useState('loading')
  const [error,setError]=useState('')
  const [oneDrive,setOneDrive]=useState({loading:true,configured:false,connected:false,connection:null,error:''})
  const [publishState,setPublishState]=useState('idle')
  const [publishMessage,setPublishMessage]=useState('')

  useEffect(()=>{
    let live=true
    Promise.allSettled([listSermonDocuments(),getOneDriveStatus(),getSermonDeviceRescues()]).then(([repository,cloud,rescues])=>{
      if(!live)return
      if(repository.status==='fulfilled'){setDocuments(repository.value.documents||[]);setState('ready')}else{setError(repository.reason?.message||'Could not load the sermon repository.');setState('error')}
      if(cloud.status==='fulfilled')setOneDrive({...cloud.value,loading:false,error:''})
      else setOneDrive(current=>({...current,loading:false,error:cloud.reason?.message||'Could not check OneDrive.'}))
      if(rescues.status==='fulfilled')setRecovered(rescues.value.sermons||[])
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
  const changeRepository=()=>window.location.assign(oneDriveConnectUrl(ONEDRIVE_REPOSITORY_SHARE_URL))

  return <section className="pillar-analysis-section sermon-repository">
    <div className="pillar-analysis-heading"><span>Teaching Repository</span><h2>Permanent Sermon Notes</h2><p>Detailed teaching documents generated from sermon transcripts and retained as Word and PDF files.</p></div>
    <div className="sermon-cloud-panel">
      <div><span>Church Triumphant OneDrive</span><strong>{oneDrive.loading?'Checking connection…':oneDrive.connected?'Connected to the new Church Triumphant repository':oneDrive.changeRequired?'Repository authorization required':'Connect the Church Triumphant repository'}</strong>{oneDrive.connected&&<small>Sermon notes, Word files, slide decks, and devotions publish beneath this repository.<br/>{oneDrive.connection?.account}</small>}{oneDrive.changeRequired&&<small className="sermon-library-error">Authorize the new repository once before Brevity publishes another file.</small>}{oneDrive.error&&<small className="sermon-library-error">{oneDrive.error}</small>}{publishMessage&&<small className={publishState==='error'?'sermon-library-error':''}>{publishMessage}</small>}</div>
      <div>{oneDrive.configured&&!oneDrive.connected&&<button type="button" className="sermon-connect-cloud" onClick={changeRepository}><i className="ti ti-brand-microsoft"/> {oneDrive.changeRequired?'Authorize new repository':'Connect OneDrive'}</button>}{oneDrive.connected&&oneDrive.connection?.folderWebUrl&&<a href={oneDrive.connection.folderWebUrl} target="_blank" rel="noreferrer"><i className="ti ti-brand-onedrive"/> Open folder</a>}{!oneDrive.connected&&<a href={ONEDRIVE_REPOSITORY_SHARE_URL} target="_blank" rel="noreferrer"><i className="ti ti-brand-onedrive"/> View new folder</a>}{notes&&<button type="button" disabled={publishState==='saving'||!oneDrive.connected} onClick={publishCurrent}><i className={`ti ${publishState==='saving'?'ti-loader-2':'ti-cloud-upload'}`}/> {publishState==='saving'?'Publishing…':'Publish current sermon'}</button>}</div>
    </div>
    {source?.document&&<div className="sermon-current-downloads"><strong>{source.document.title}</strong><span><a href={source.document.files.docx}>Download Word</a><a href={source.document.files.pdf}>Download PDF</a></span></div>}
    {notes?<details className="sermon-notes-panel" open><summary><span>{notes.documentTitle||notes.title||'Current Teaching'}</span><small>Read detailed notes</small></summary><SermonNotesView notes={notes}/></details>:<p className="pillar-analysis-empty">Upload a sermon transcript during Morning Alignment to create the first detailed teaching document.</p>}
    <div className="sermon-library-list"><h3>Repository Files</h3>{state==='loading'&&<p>Loading documents…</p>}{error&&<p className="sermon-library-error">{error}</p>}{state==='ready'&&!documents.length&&<p>No archived documents yet.</p>}{documents.map(document=><article key={document.id}><div><strong>{document.title}</strong><small>{[document.serviceType,document.sermonDate,document.preacherTeacher].filter(Boolean).join(' · ')}</small>{document.oneDrive?.state==='published'&&<small className="sermon-cloud-ready"><i className="ti ti-cloud-check"/> OneDrive</small>}</div><span><a href={document.files.docx}>Word</a><a href={document.files.pdf}>PDF</a></span></article>)}</div>
    {recovered.length>0&&<div className="sermon-library-list sermon-recovered-list"><h3>Recovered Device Records</h3><p>Exact legacy sermon versions preserved from Apostolic Sermon Builder devices.</p>{recovered.map(record=><article key={record.id}><div><strong>{record.title}</strong><small>{[record.dateLabel,record.hasNotes?'Notes included':null,record.quoteCount?`${record.quoteCount} quotes`:null,record.infographicCount?`${record.infographicCount} infographics`:null].filter(Boolean).join(' · ')}</small>{record.conflictGroup&&<small className="sermon-recovered-conflict"><i className="ti ti-git-compare"/> Conflicting device version preserved</small>}</div><span><a href={record.recordDownload||`/.netlify/functions/sermon-device-rescue?fingerprint=${encodeURIComponent(record.fingerprint)}`}>Original JSON</a></span></article>)}</div>}
  </section>
}
