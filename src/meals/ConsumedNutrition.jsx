import { useCallback, useEffect, useState } from 'react'
import { ACTION_COMPLETED_EVENT, requestActionReview } from '../assistant/actionEvents.js'
import { prepareDirectAction } from '../assistant/assistantApi.js'

const FIELDS=[['calories','Calories','cal'],['proteinGrams','Protein','g'],['carbohydrateGrams','Carbs','g'],['fatGrams','Fat','g']]
const display=(value,unit)=>`${Number(value||0).toLocaleString()} ${unit}`

export default function ConsumedNutrition({currentMember}){
  const [record,setRecord]=useState(null)
  const [form,setForm]=useState({})
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const load=useCallback(async()=>{
    const response=await fetch('/.netlify/functions/nutrition-records',{credentials:'include'})
    const data=await response.json().catch(()=>({}))
    if(!response.ok)throw new Error(data.error||'Could not load consumed meals.')
    if(currentMember && data.member!==currentMember)throw new Error('The signed-in member changed. Refresh Brevity.')
    setRecord(data)
    setForm(Object.fromEntries(FIELDS.map(([key])=>[key,data.targets?.[key]??''])))
  },[currentMember])
  useEffect(()=>{load().catch(cause=>setError(cause.message));const refreshed=()=>load().catch(cause=>setError(cause.message));window.addEventListener(ACTION_COMPLETED_EVENT,refreshed);return()=>window.removeEventListener(ACTION_COMPLETED_EVENT,refreshed)},[load])
  const review=async event=>{
    event.preventDefault();setError('');setBusy(true)
    try{
      const payload=Object.fromEntries(FIELDS.filter(([key])=>form[key]!==''&&form[key]!=null).map(([key])=>[key,Number(form[key])]))
      if(!Object.keys(payload).length)throw new Error('Enter at least one daily target.')
      const result=await prepareDirectAction({summary:`Update ${record.member}’s daily nutrition targets`,expectedVersion:record.targetVersion,operation:{type:'nutrition.targets.update',targetId:record.member,targetDate:record.date,description:`Set daily nutrition targets for ${record.member}`,payload}})
      if(!result?.proposal?.id||!requestActionReview(result.proposal))throw new Error('Action Mode could not open the target review.')
    }catch(cause){setError(cause.message||'Could not prepare nutrition targets.')}finally{setBusy(false)}
  }
  if(!record)return <section className="meal-plan-insight" aria-label="Consumed nutrition">{error?<p role="alert">{error} <button onClick={()=>load().catch(cause=>setError(cause.message))}>Retry</button></p>:<p role="status">Loading your nutrition record…</p>}</section>
  return <div className="consumed-nutrition">
    <section className="meal-plan-insight" aria-label="Consumed nutrition today"><div><span>Saved consumption · {record.member}</span><strong>{record.date}</strong><p>Only meals confirmed through Action Mode count here. Nutrition is estimated; check packaged foods against their labels.</p></div><dl>{FIELDS.map(([key,label,unit])=><div key={key}><dt>{label} consumed</dt><dd>{display(record.days[0].totals[key],unit)}{record.targets[key]!=null&&<small> / {display(record.targets[key],unit)} target</small>}</dd></div>)}</dl></section>
    <section className="consumed-nutrition-panel"><h2>Daily targets</h2><p>Choose targets for your own record. Review the change in Action Mode before saving.</p><form onSubmit={review}><div className="consumed-nutrition-fields">{FIELDS.map(([key,label,unit])=><label key={key}>{label} ({unit})<input type="number" min="0.1" max={key==='calories'?10000:1000} step="0.1" value={form[key]} onChange={event=>setForm(current=>({...current,[key]:event.target.value}))}/></label>)}</div><button type="submit" disabled={busy}>{busy?'Opening review…':'Review targets'}</button></form>{error&&<p role="alert">{error}</p>}</section>
    <section className="consumed-nutrition-panel"><h2>Saved meals</h2>{record.days.map(day=><article key={day.date}><h3>{day.date}</h3>{day.entries.length?<ul>{day.entries.map(entry=><li key={entry.id}><strong>{entry.name}</strong> · {display(entry.macros?.calories,'cal')} · {display(entry.macros?.proteinGrams,'g')} protein <small>Estimated · saved by {entry.loggedBy}</small></li>)}</ul>:<p>No confirmed meals saved.</p>}</article>)}</section>
    <section className="consumed-nutrition-panel"><h2>Last 7 days</h2><p>{FIELDS.map(([key,label,unit])=>`${label}: ${display(record.weeklyTotals[key],unit)}`).join(' · ')}</p></section>
  </div>
}
