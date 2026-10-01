import { useEffect, useState } from 'react'
import { ACTION_COMPLETED_EVENT, requestActionReview, requestAssistantConversation } from '../assistant/actionEvents.js'
import { prepareMealSubstitution } from './mealPlanApi.js'
import { personalMealPlan, scaledIngredient } from './personalMealPlan.js'
import './TodayMealsPanel.css'

const LABELS = {breakfast:'Breakfast',lunch:'Lunch',dinner:'Dinner',snack1:'Snack 1',snack2:'Snack 2'}
const FIELDS = [['calories','Calories','cal'],['proteinGrams','Protein','g'],['carbohydrateGrams','Carbs','g'],['fatGrams','Fat','g']]
const display = value => value == null ? 'Unknown' : Number(value).toLocaleString(undefined,{maximumFractionDigits:1})
export default function TodayMealsPanel({meals, currentMember, mealDay, library = [], onOpenMealPlan, browsingDate, readOnly = false}) {
  const [nutrition,setNutrition] = useState(null)
  const [error,setError] = useState('')
  const [swap,setSwap] = useState(null)
  const [busy,setBusy] = useState(false)
  const [swapError,setSwapError] = useState('')
  useEffect(() => {
    let active = true, request = 0
    const load = async () => {
      const currentRequest = ++request
      try {
        const response = await fetch('/.netlify/functions/nutrition-records',{credentials:'include',cache:'no-store'})
        const data = await response.json()
        if (!response.ok || data.member !== currentMember) throw new Error('Your nutrition goals could not be verified. Open Meal Plan to retry.')
        if (active && currentRequest === request) {setNutrition(data);setError('')}
      } catch (cause) {if(active && currentRequest === request){setNutrition(null);setError(cause.message)}}
    }
    setNutrition(null);setError('');setSwap(null);load()
    window.addEventListener(ACTION_COMPLETED_EVENT,load)
    return () => {active=false;window.removeEventListener(ACTION_COMPLETED_EVENT,load)}
  },[currentMember])
  const verified = nutrition?.member === currentMember
  const targets = verified ? nutrition.targets : {}
  const personal = personalMealPlan(meals,targets)
  const reviewSwap = async () => {
    setBusy(true);setSwapError('')
    try {
      const result = await prepareMealSubstitution({date:swap.date,mealType:swap.slot,mealId:swap.id,expectedVersion:swap.version})
      if (!requestActionReview(result.proposal)) throw new Error('Action Mode could not open this review.')
      setSwap(null)
    } catch (cause) {setSwapError(cause.message)} finally {setBusy(false)}
  }
  return <section className="today-section today-meals" aria-labelledby="today-meals-title" data-pillar="health">
    <div className="today-section-heading"><div><span>Pillar 2 · Health &amp; Nutrition</span><h2 id="today-meals-title">{browsingDate?'Planned Meals':'Today’s Meals'}</h2></div><button className="today-meals-open" aria-label="Open Meal Plan" onClick={onOpenMealPlan}>Open Meal Plan →</button></div>
    <section className="today-macro-summary" aria-label="Planned daily macros compared with goals">
      <h3>{currentMember}’s planned daily macros</h3><p>If you eat all the portions and both snacks below. These are estimates, not logged consumption.</p>
      {!personal.complete && <p role="status">The plan is incomplete. Totals cover only the listed items; missing meals have not been estimated.</p>}
      {!verified && <p role="status">{error || 'Loading your saved macro goals…'}</p>}
      <div className="today-macro-goals">{FIELDS.map(([key,label,unit]) => {
        const total=personal.totals[key], goal=targets[key], hasGoal=Number.isFinite(goal)&&goal>0
        return <div key={key}><strong>{label}</strong><p>{display(total)} {unit} / {hasGoal?`${display(goal)} ${unit}`:'Goal not set'}</p><progress aria-label={`${label} planned versus goal`} max={hasGoal?goal:1} value={hasGoal&&total!=null?Math.min(total,goal):0}/><small>{hasGoal&&total!=null?`${display(Math.abs(goal-total))} ${unit} ${total>goal?'over goal':'below goal'}`:'Set your target with Brevity'}</small></div>
      })}</div>
      <p>{personal.factor===1?'Standard recipe portions shown.':`Your main meals use ${personal.factor}× the standard recipe serving; both snacks remain full portions.`} Saved goals are unchanged. {personal.totals.proteinGrams!=null&&targets.proteinGrams>personal.totals.proteinGrams+1?`You still need ${display(targets.proteinGrams-personal.totals.proteinGrams)} g protein; ask Brevity for a different snack or meal combination.`:''}</p>
      <button onClick={()=>requestAssistantConversation('Read my saved nutrition targets and the authoritative meal plan including both snacks for today. Help me balance the plan against all four macro goals. Ask about brands, portions, and food restrictions before recommending replacements. Prepare any saved changes for Action Mode review.')}>Balance my meals with Brevity</button>
    </section>
    <div className="today-meal-grid">{Object.entries(LABELS).filter(([slot])=>personal.meals[slot]).map(([slot,label])=>{
      const meal=personal.meals[slot]
      return <article className={`today-meal-card${slot.startsWith('snack')?' today-snack-card':''}`} key={slot}>
        {meal.image&&<img src={meal.image} alt={`${label}: ${meal.name}`} loading="lazy"/>}
        <div className="today-meal-card-copy"><span>{label}</span><strong>{meal.name}</strong><small>{meal.portionMultiplier}× {meal.baseServing || 'recipe serving'}</small><div className="today-meal-macros" aria-label={`${label} nutrition`}>{FIELDS.map(([key,name,unit])=><em key={key}><b>{display(meal.macros[key])}{unit==='g'?'g':''}</b> {unit==='cal'?'cal':name.toLowerCase()}</em>)}</div>
          <details><summary>My portion &amp; nutrition basis</summary><ul>{(meal.ingredients||[]).map((item,index)=><li key={index}>{meal.portionMultiplier===1?item:scaledIngredient(item,meal.portionMultiplier)}</li>)}</ul><small>{meal.nutritionBasis}</small>{meal.sourceUrl&&<a href={meal.sourceUrl} target="_blank" rel="noreferrer">Nutrition source</a>}</details>
          {mealDay&&!readOnly&&<button aria-label={`Swap ${label}`} onClick={()=>{setSwap({slot,id:meal.id,date:mealDay.date,version:mealDay.version});setSwapError('')}}>Swap {label}</button>}
        </div>
      </article>
    })}</div>
    {swap&&<div className="meal-dialog-backdrop"><section className="today-snack-swap" role="dialog" aria-modal="true" aria-label={`Swap ${LABELS[swap.slot]}`}><h3>Swap {LABELS[swap.slot]}</h3><p>This changes the shared meal plan for {swap.date}. Each member’s displayed portion uses their own goals.</p><label>Replacement<select value={swap.id} onChange={event=>setSwap({...swap,id:event.target.value})}>{library.map(meal=><option key={meal.id} value={meal.id}>{meal.name}</option>)}</select></label><p>Nothing changes until you approve in Action Mode. Audit History provides safe Undo.</p>{swapError&&<p role="alert">{swapError}</p>}<button disabled={busy} onClick={()=>setSwap(null)}>Cancel</button><button disabled={busy||swap.id===meals[swap.slot]?.id} onClick={reviewSwap}>{busy?'Opening review…':'Review swap'}</button></section></div>}
  </section>
}
