import {useEffect,useMemo,useState} from 'react'
import {editablePacketFields,effectiveMeetingPacket,packetEvidenceIdentity,packetIdentity,packetMatchesRequest} from './meetingPacketIntelligence.js'

export function usePacketIntelligence(source,edits={}){
  const base=useMemo(()=>effectiveMeetingPacket(source,edits),[source,edits])
  const key=JSON.stringify([packetEvidenceIdentity(base),edits])
  const [remote,setRemote]=useState(null),[retry,setRetry]=useState(0)
  useEffect(()=>{
    const controller=new AbortController()
    let retryTimer
    const timer=setTimeout(async()=>{
      try{
        const response=await fetch('/.netlify/functions/finance-meeting-packet',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},signal:controller.signal,body:JSON.stringify({cadence:source.cadence,mode:source.period.mode,accountIds:source.scope.map(a=>a.id)})})
        const result=await response.json()
        if(!response.ok||!result.packet)throw Error(result.error||'Automatic AI analysis is temporarily unavailable.')
        if(controller.signal.aborted)return
        const matched=packetMatchesRequest(source,result.packet)
        setRemote({key,packet:matched?result.packet:null,notice:matched?['Prepared from synchronized household records.',result.notice].filter(Boolean).join(' '):'Calculated insights are current. The requested report is synchronizing.',state:matched?result.analysisState:'syncing',analyzedAt:result.analyzedAt})
        if(!matched||result.analysisState!=='ready')retryTimer=setTimeout(()=>setRetry(v=>v+1),60000)
      }catch(error){if(!controller.signal.aborted){setRemote({key,notice:'Calculated insights are available now. The deployed AI connection is unavailable or still synchronizing.',state:'unavailable'});retryTimer=setTimeout(()=>setRetry(v=>v+1),60000)}}
    },1500)
    return()=>{clearTimeout(timer);clearTimeout(retryTimer);controller.abort()}
  },[key,retry])
  const current=remote?.key===key?remote:null
  const packet=current?.packet||base
  return {packet,analysisNotice:current?.notice||'Automatic analysis is preparing. Calculated feedback and proposed actions are available now.'}
}

export default function FinancePacketIntelligence({packet,onEdit,onProposeAction,readOnly=false,notice=''}){
  const [open,setOpen]=useState(false),[search,setSearch]=useState(''),[field,setField]=useState('analysis/summary'),[value,setValue]=useState(''),[scope,setScope]=useState('period'),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const fields=editablePacketFields(packet),selected=fields.find(f=>f.field===field)
  const serializedValue=selected?.value==null?'':String(selected.value)
  useEffect(()=>{setValue(serializedValue)},[field,serializedValue])
  const visible=fields.filter(f=>`${f.label} ${f.field}`.toLowerCase().includes(search.toLowerCase()))
  const review=async reset=>{
    if(!selected)return
    setBusy(true);setError('')
    try{
      const parsed=selected.type==='number'?(value.trim()===''?null:Number(value)):value
      if(selected.type==='number'&&parsed!==null&&!Number.isFinite(parsed))throw Error('Enter a valid number or leave blank for unknown.')
      await onEdit({packetId:packetIdentity(packet),cadence:packet.cadence,scope,field,value:parsed,reason,...(reset?{reset:true}:{})})
    }catch(e){setError(e.message||'Could not prepare the report edit.')}
    finally{setBusy(false)}
  }
  return <section className="fm-packet-intelligence" aria-label="Automatic financial analysis">
    <header><div><h3>Brevity’s feedback and direction</h3><small>{packet.analysis.mode} · Proposed guidance</small></div>{!readOnly&&<button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{open?'Close report editor':'Edit report, insights or numbers'}</button>}</header>
    <p>{packet.analysis.summary}</p><h4>Recommended direction</h4><p>{packet.analysis.direction}</p>
    <h4>Actionable insights</h4><p className="fm-packet-prose">{packet.analysis.insights}</p>
    <h4>Proposed actions, owners and deadlines</h4><p className="fm-packet-prose">{packet.analysis.actions}</p>
    <h4>Report notes</h4><p className="fm-packet-prose">{packet.notes}</p>
    <details><summary>Suggested commitments ready for review</summary>{packet.analysis.recommendations.map(a=><article className="fm-packet-suggestion" key={a.id}><p>{a.text}<br/><small>Proposed owner: {a.owner} · deadline: {a.due}</small></p>{!readOnly&&<button type="button" disabled={busy||packet.openActions.some(saved=>saved.text===a.text)} onClick={async()=>{setBusy(true);setError('');try{await onProposeAction(a)}catch(e){setError(e.message)}finally{setBusy(false)}}}>{packet.openActions.some(saved=>saved.text===a.text)?'In action register':'Review commitment'}</button>}</article>)}</details>
    {notice&&<p className="fm-packet-source" role="status">{notice}</p>}
    {error&&!open&&<p role="alert" className="fm-edit-error">{error}</p>}
    {packet.adjustments.length>0&&<details><summary>{packet.adjustments.length} saved household adjustment{packet.adjustments.length===1?'':'s'}</summary><ul>{packet.adjustments.map(a=><li key={a.field}><strong>{a.field}</strong>: {String(a.sourceValue??'unknown')} → {String(a.value??'unknown')}. {a.by} · {a.reason}</li>)}</ul></details>}
    {packet.orphanedAdjustments.length>0&&<p role="status">{packet.orphanedAdjustments.length} saved edit no longer matches a report row. The edit is retained but has not been applied to a different row.</p>}
    {open&&!readOnly&&<div className="fm-packet-editor" aria-label="Edit generated report">
      <p>Everything is prepared automatically. Optional edits change your household’s reported view. Bank source records stay available in the adjustment history. Saved edits survive refreshes; restore the automatic value whenever you choose.</p>
      <label>Find a report field<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cash, posted, budget, notes, insights…"/></label>
      <label>Report field<select aria-label="Report field" value={field} onChange={e=>setField(e.target.value)}>{!visible.some(f=>f.field===field)&&selected&&<option value={field}>{selected.label}</option>}{visible.map(f=><option key={f.field} value={f.field}>{f.label}</option>)}</select></label>
      <label>Reported value{selected?.type==='number'?<input aria-label="Reported value" type="number" step="any" value={value} onChange={e=>setValue(e.target.value)} placeholder="Unknown"/>:<textarea aria-label="Reported value" rows="5" value={value} onChange={e=>setValue(e.target.value)}/>}</label>
      <label>Apply edit to<select aria-label="Apply edit to" value={scope} onChange={e=>setScope(e.target.value)}><option value="period">This report period</option><option value="cadence">This meeting cadence going forward</option></select></label>
      <label>Reason or context (optional)<textarea rows="2" value={reason} onChange={e=>setReason(e.target.value)}/></label>
      {error&&<p role="alert" className="fm-edit-error">{error}</p>}
      <div><button type="button" disabled={busy||!selected} onClick={()=>review(false)}>{busy?'Preparing review…':'Review edit'}</button><button type="button" disabled={busy||!selected} onClick={()=>review(true)}>Restore automatic value</button></div>
      <small>Component figure edits recalculate dependent totals and insights. Editing a total directly records an independent adjustment. Confirm saved edits in Action Mode.</small>
    </div>}
  </section>
}
