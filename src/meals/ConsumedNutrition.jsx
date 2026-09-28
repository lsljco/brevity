import { useCallback, useEffect, useState } from 'react'
import { ACTION_COMPLETED_EVENT, requestActionReview, requestAssistantConversation } from '../assistant/actionEvents.js'
import { prepareDirectAction, prepareRepeatMeal } from '../assistant/assistantApi.js'

const FIELDS=[['calories','Calories','cal'],['proteinGrams','Protein','g'],['carbohydrateGrams','Carbs','g'],['fatGrams','Fat','g']]
const display=(value,unit)=>`${Number(value||0).toLocaleString()} ${unit}`

function SavedMeal({entry,day,member,todayVersion,onError}){
  const [busy,setBusy]=useState(false)
  const repeat=async()=>{
    onError('');setBusy(true)
    try{
      const result=await prepareRepeatMeal({sourceDate:day.date,entryId:entry.id,sourceVersion:day.version,expectedVersion:todayVersion})
      if(!result?.proposal?.id||!requestActionReview(result.proposal))throw new Error('Action Mode could not open this meal review.')
    }catch(cause){onError(cause.message||'Could not prepare this meal.')}finally{setBusy(false)}
  }
  return <li><strong>{entry.name}</strong> · {display(entry.macros?.calories,'cal')} · {display(entry.macros?.proteinGrams,'g')} protein <small>Estimated · saved by {entry.loggedBy}{entry.correctedBy?` · corrected by ${entry.correctedBy}`:''}</small>
    {entry.ingredients?.length>0&&<details><summary>View estimated foods and portions</summary><ul>{entry.ingredients.map((item,index)=><li key={index}>{item.amountDescription||item.input} · {display(item.macros?.calories,'cal')} · {display(item.macros?.proteinGrams,'g')} protein<small>Estimate basis: {item.basis||'Not recorded'} · Model confidence: {item.confidence||'not recorded'}</small>{item.sourceUrl&&/^https:\/\//.test(item.sourceUrl)&&<a href={item.sourceUrl} target="_blank" rel="noreferrer">Nutrition source</a>}</li>)}</ul>{entry.warnings?.length>0&&<p>{entry.warnings.join(' ')}</p>}</details>}
    <button type="button" disabled={busy} onClick={repeat}>Repeat meal today — review</button>
    <button type="button" onClick={()=>requestAssistantConversation(`Help me correct my saved meal ${JSON.stringify(entry.name)} from ${day.date}, entry ${entry.id}. Ask me what foods or portions changed, then calculate the updated meal for review.`)}>Correct with Brevity</button>
  </li>
}

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
    <section className="meal-plan-insight" aria-label="Consumed nutrition today"><div><span>Saved consumption · {record.member}</span><strong>{record.date}</strong><p>Only meals confirmed through Action Mode count here. Nutrition is estimated; check packaged foods against their labels.</p><p>Additional nutrients: {([['fiberGrams','Fiber','g'],['sugarGrams','Sugar','g'],['sodiumMilligrams','Sodium','mg']]).map(([key,label,unit])=>`${label}: ${record.days[0].optionalTotals?.[key]==null?'unknown':display(record.days[0].optionalTotals[key],unit)}`).join(' · ')}</p></div><dl>{FIELDS.map(([key,label,unit])=><div key={key}><dt>{label} consumed</dt><dd>{display(record.days[0].totals[key],unit)}{record.targets[key]!=null&&<small> / {display(record.targets[key],unit)} target</small>}</dd></div>)}</dl></section>
    <section className="consumed-nutrition-panel" aria-label="Nutrition remaining today"><h2>What remains today</h2><div className="consumed-nutrition-fields">{FIELDS.map(([key,label,unit])=><div key={key}><strong>{label}</strong><p>{record.progress?.nutrients?.[key]?.target==null?'Set a target':key==='proteinGrams'&&record.progress.nutrients[key].remaining===0?'Target met':record.progress.nutrients[key].over>0?`${display(record.progress.nutrients[key].over,unit)} over target`:`${display(record.progress.nutrients[key].remaining,unit)} remaining`}</p></div>)}</div><h3>What to eat next</h3><ul>{(record.progress?.guidance||[]).map((tip,index)=><li key={index}>{tip}</li>)}</ul><small>{record.progress?.notice}</small></section>
    <section className="consumed-nutrition-panel"><h2>Daily targets</h2><p>Choose targets for your own record. Review the change in Action Mode before saving.</p><form onSubmit={review}><div className="consumed-nutrition-fields">{FIELDS.map(([key,label,unit])=><label key={key}>{label} ({unit})<input type="number" min="0.1" max={key==='calories'?10000:1000} step="0.1" value={form[key]} onChange={event=>setForm(current=>({...current,[key]:event.target.value}))}/></label>)}</div><button type="submit" disabled={busy}>{busy?'Opening review…':'Review targets'}</button></form>{error&&<p role="alert">{error}</p>}</section>
    <section className="consumed-nutrition-panel"><h2>Saved meals</h2>{record.days.map(day=><article key={day.date}><h3>{day.date}</h3>{day.entries.length?<ul>{day.entries.map(entry=><SavedMeal key={entry.id} entry={entry} day={day} member={record.member} todayVersion={record.days[0].version} onError={setError}/>)}</ul>:<p>No confirmed meals saved.</p>}</article>)}</section>
    <section className="consumed-nutrition-panel"><h2>Last 7 days</h2><p>{FIELDS.map(([key,label,unit])=>`${label}: ${display(record.weeklyTotals[key],unit)}`).join(' · ')}</p><p>{record.pilot?.confirmedMeals??0} confirmed meals · {record.pilot?.daysWithMeals??0} days logged · {record.pilot?.correctedMeals??0} corrected meals</p>{record.pilot?.possibleDuplicates?.length>0&&<p role="status">{record.pilot.possibleDuplicates.length} matching meal pair{record.pilot.possibleDuplicates.length===1?'':'s'} may need review. {record.pilot.notice}</p>}</section>
  </div>
}
