import { useCallback, useEffect, useState } from 'react'
import { ACTION_COMPLETED_EVENT, requestActionReview } from '../assistant/actionEvents.js'
import { prepareDirectAction } from '../assistant/assistantApi.js'
import { calculateMealNutrition } from './mealPlanApi.js'

const FIELDS=[['calories','Calories','cal'],['proteinGrams','Protein','g'],['carbohydrateGrams','Carbs','g'],['fatGrams','Fat','g']]
const display=(value,unit)=>`${Number(value||0).toLocaleString()} ${unit}`

function SavedMeal({entry,day,member,onError}){
  const [editing,setEditing]=useState(false)
  const [busy,setBusy]=useState(false)
  const [reason,setReason]=useState('')
  const [name,setName]=useState(entry.name)
  const [foods,setFoods]=useState((entry.ingredients||[]).map(item=>item.input).join('\n'))
  const [estimate,setEstimate]=useState(null)
  const [calculating,setCalculating]=useState(false)
  const [calculationError,setCalculationError]=useState('')
  const lines=()=>foods.split(/\r?\n/).map(line=>line.trim()).filter(Boolean)
  const recalculate=async()=>{
    setCalculationError('');setEstimate(null);setCalculating(true)
    try{
      if(!lines().length)throw new Error('Enter each food and its amount on a separate line.')
      const result=await calculateMealNutrition(lines(),1,'meal')
      setEstimate(result.nutrition)
    }catch(cause){setCalculationError(cause.message||'Could not calculate nutrition.')}finally{setCalculating(false)}
  }
  const prepare=async type=>{
    onError('');setBusy(true)
    try{
      if(!reason.trim())throw new Error('Explain why this meal needs correction.')
      const payload={entryId:entry.id,reason:reason.trim()}
      if(type==='nutrition.meal.update'){
        if(!name.trim()||!estimate)throw new Error('Calculate the updated foods and portions before reviewing the correction.')
        Object.assign(payload,{name:name.trim(),estimateJson:JSON.stringify(estimate)},estimate.perServingMacros)
      }
      const result=await prepareDirectAction({summary:`${type==='nutrition.meal.remove'?'Remove':'Correct'} ${entry.name} from ${day.date}`,expectedVersion:day.version,operation:{type,targetId:member,targetDate:day.date,description:`${type==='nutrition.meal.remove'?'Remove':'Correct'} saved meal ${entry.name}: ${reason.trim()}`,payload}})
      if(!result?.proposal?.id||!requestActionReview(result.proposal))throw new Error('Action Mode could not open this meal review.')
      setEditing(false)
    }catch(cause){onError(cause.message||'Could not prepare this correction.')}finally{setBusy(false)}
  }
  return <li><strong>{entry.name}</strong> · {display(entry.macros?.calories,'cal')} · {display(entry.macros?.proteinGrams,'g')} protein <small>Estimated · saved by {entry.loggedBy}{entry.correctedBy?` · corrected by ${entry.correctedBy}`:''}</small>
    {entry.ingredients?.length>0&&<details><summary>View estimated foods and portions</summary><ul>{entry.ingredients.map((item,index)=><li key={index}>{item.amountDescription || item.input} · {display(item.macros?.calories,'cal')} · {display(item.macros?.proteinGrams,'g')} protein</li>)}</ul>{entry.warnings?.length>0&&<p>{entry.warnings.join(' ')}</p>}</details>}
    <button type="button" onClick={()=>setEditing(value=>!value)}>{editing?'Cancel correction':'Correct meal'}</button>
    {editing&&<div className="consumed-meal-correction"><label>Meal name<input value={name} onChange={event=>setName(event.target.value)} maxLength={300}/></label><label>Foods and amounts (one per line)<textarea value={foods} onChange={event=>{setFoods(event.target.value);setEstimate(null);setCalculationError('')}} placeholder="6 oz Eckrich smoked sausage&#10;1 Premier Protein shake&#10;2 slices Nature’s Own Honey Wheat bread"/></label><button type="button" disabled={calculating||busy||!lines().length} onClick={recalculate}>{calculating?'Calculating…':'Calculate macros from foods'}</button>{calculationError&&<p role="alert">{calculationError}</p>}{estimate&&<div className="consumed-calculated-macros" role="status"><strong>Calculated meal</strong><p>{FIELDS.map(([key,label,unit])=>`${label}: ${display(estimate.perServingMacros[key],unit)}`).join(' · ')}</p><details><summary>Ingredient breakdown</summary><ul>{estimate.ingredients.map((item,index)=><li key={index}>{item.input} · {display(item.macros.calories,'cal')} · {display(item.macros.proteinGrams,'g')} protein</li>)}</ul></details>{estimate.warnings?.map((warning,index)=><p key={index}>{warning}</p>)}</div>}<label>Reason for correction<textarea value={reason} onChange={event=>setReason(event.target.value)} maxLength={300} placeholder="For example, the label lists different values or this meal was logged in error."/></label><div><button type="button" disabled={busy||calculating||!estimate} onClick={()=>prepare('nutrition.meal.update')}>Review correction</button><button type="button" disabled={busy} onClick={()=>prepare('nutrition.meal.remove')}>Review removal</button></div></div>}
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
    <section className="consumed-nutrition-panel"><h2>Saved meals</h2>{record.days.map(day=><article key={day.date}><h3>{day.date}</h3>{day.entries.length?<ul>{day.entries.map(entry=><SavedMeal key={entry.id} entry={entry} day={day} member={record.member} onError={setError}/>)}</ul>:<p>No confirmed meals saved.</p>}</article>)}</section>
    <section className="consumed-nutrition-panel"><h2>Last 7 days</h2><p>{FIELDS.map(([key,label,unit])=>`${label}: ${display(record.weeklyTotals[key],unit)}`).join(' · ')}</p><p>{record.pilot?.confirmedMeals??0} confirmed meals · {record.pilot?.daysWithMeals??0} days logged · {record.pilot?.correctedMeals??0} corrected meals</p>{record.pilot?.possibleDuplicates?.length>0&&<p role="status">{record.pilot.possibleDuplicates.length} matching meal pair{record.pilot.possibleDuplicates.length===1?'':'s'} may need review. {record.pilot.notice}</p>}</section>
  </div>
}
