import { useEffect, useRef, useState } from 'react'
import { getSermonDeviceRescues, importSermonDeviceRescue } from './sermonFormationApi.js'
import './SermonDeviceRescue.css'

const BOOKMARKLET = "javascript:(()=>{const s=document.createElement('script');s.src='https://brevityoflife.netlify.app/apostolic-device-rescue.js?v=1';document.head.appendChild(s)})()"
const normalizeRescueData = value => ({
  imports:Array.isArray(value?.imports) ? value.imports : [],
  sermons:Array.isArray(value?.sermons) ? value.sermons : [],
})

export default function SermonDeviceRescue(){
  const inputRef=useRef(null)
  const [data,setData]=useState({imports:[],sermons:[]})
  const [state,setState]=useState('loading')
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')

  useEffect(()=>{let live=true;getSermonDeviceRescues().then(value=>{if(live){setData(normalizeRescueData(value));setState('ready')}}).catch(reason=>{if(live){setError(reason.message);setState('error')}});return()=>{live=false}},[])

  const copyTool=async()=>{
    setError('');setMessage('')
    try{await navigator.clipboard.writeText(BOOKMARKLET);setMessage('Rescue bookmark code copied. Add it as a bookmark on Lorenzo’s device, then run it while the full Apostolic Sermon Builder is open.')}
    catch{window.prompt('Copy this complete rescue bookmark code:',BOOKMARKLET)}
  }
  const upload=event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return
    if(file.size>5_250_000){setError('That rescue package is larger than 5.25 MB. Do not delete it; preserve the file and contact the administrator for a larger offline import.');return}
    setState('importing');setError('');setMessage('')
    const reader=new FileReader()
    reader.onload=async()=>{try{const parsed=JSON.parse(reader.result);const result=await importSermonDeviceRescue(parsed);setData(normalizeRescueData(result));setMessage(result.idempotent?'That exact device export was already preserved; no duplicate records were created.':`${result.import.deviceLabel} is preserved: ${result.import.counts.sermons} sermons, ${result.import.counts.revelationThreads} revelation threads, and ${result.import.counts.counselingProfiles} counseling profiles.`);setState('ready')}catch(reason){setError(reason.message||'The device rescue package could not be preserved.');setState('error')}}
    reader.onerror=()=>{setError('The rescue package could not be read. The original file was not changed.');setState('error')}
    reader.readAsText(file)
  }
  const imports=Array.isArray(data?.imports)?data.imports:[]
  const sermons=Array.isArray(data?.sermons)?data.sermons:[]
  const conflicts=sermons.filter(item=>item?.conflictGroup).length
  return <section className="sermon-rescue-settings">
    <header><div><p>Apostolic Sermon Builder</p><h2>Device Rescue & Durable Preservation</h2><span>Preserve every device before replacing local-only storage.</span></div><i className="ti ti-shield-lock"/></header>
    <div className="sermon-rescue-warning"><i className="ti ti-alert-triangle"/><span><strong>Do not clear Safari data, uninstall the app, reset the device, or overwrite Lorenzo’s browser storage.</strong><small>The standalone builder currently keeps sermons and related work only on the device where they were created.</small></span></div>
    <ol className="sermon-rescue-steps">
      <li><strong>On Lorenzo’s device, create a browser bookmark.</strong><span>Any page can be bookmarked temporarily.</span></li>
      <li><strong>Copy the rescue code below and replace that bookmark’s address with it.</strong><button type="button" onClick={copyTool}><i className="ti ti-copy"/> Copy rescue bookmark code</button></li>
      <li><strong>Open Apostolic Sermon Builder full screen and run the rescue bookmark.</strong><a href="https://apostolicsermonbuilderlseay.netlify.app/" target="_blank" rel="noreferrer">Open builder <i className="ti ti-external-link"/></a><span>It downloads a complete JSON rescue package without changing or deleting anything.</span></li>
      <li><strong>Return here and preserve that device package in Brevity.</strong><button type="button" disabled={state==='importing'} onClick={()=>inputRef.current?.click()}><i className={`ti ${state==='importing'?'ti-loader-2':'ti-file-upload'}`}/> {state==='importing'?'Validating and preserving…':'Upload device rescue package'}</button><input ref={inputRef} type="file" accept="application/json,.json" onChange={upload}/></li>
    </ol>
    {message&&<div className="sermon-rescue-message is-success" role="status"><i className="ti ti-circle-check"/> {message}</div>}
    {error&&<div className="sermon-rescue-message is-error" role="alert"><i className="ti ti-alert-triangle"/> {error}</div>}
    <div className="sermon-rescue-metrics"><div><strong>{imports.length}</strong><span>Device exports preserved</span></div><div><strong>{sermons.length}</strong><span>Unique sermon versions</span></div><div><strong>{conflicts}</strong><span>Versions needing review</span></div></div>
    {imports.length>0&&<div className="sermon-rescue-imports"><h3>Immutable device backups</h3>{imports.map(item=><article key={item.id}><div><strong>{item.deviceLabel}</strong><span>{item.counts.sermons} sermons · {item.counts.revelationThreads} threads · imported by {item.importedBy}</span></div><a href={item.backupDownload}>Download backup</a></article>)}</div>}
    {conflicts>0&&<p className="sermon-rescue-conflict"><i className="ti ti-git-compare"/> Brevity preserved every conflicting version. None was selected or overwritten; review is required before consolidation.</p>}
  </section>
}
