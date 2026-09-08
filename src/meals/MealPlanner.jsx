import { useEffect, useMemo, useState } from 'react'
import { MEAL_TYPES } from './mealLibrary.js'
import { useRollingMealPlan } from './useRollingMealPlan.js'
import { summarizeMealPlan } from './mealPlanInsights.js'
import './MealPlanner.css'
import './MealPlannerInsights.css'

const LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }
const ICONS = { breakfast: 'ti-sunrise', lunch: 'ti-sun-high', dinner: 'ti-moon-stars' }

const formatDay = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

function Macros({ meal }) {
  return <div className="meal-macros" aria-label={`Estimated nutrition per ${meal.serving}`} title={meal.nutritionBasis}><span><strong>{meal.macros.calories}</strong> cal</span><span><strong>{meal.macros.proteinGrams}g</strong> protein</span><span><strong>{meal.macros.carbohydrateGrams}g</strong> carbs</span><span><strong>{meal.macros.fatGrams}g</strong> fat</span></div>
}

function MealChoice({ meal, onChoose, selected, current }) {
  return <button type="button" className={`meal-choice${selected ? ' is-selected' : ''}`} onClick={onChoose}>
    <img src={meal.image} alt="" loading="lazy" />
    <span className="meal-choice-mark"><i className={`ti ${selected ? 'ti-circle-check-filled' : 'ti-circle'}`} /></span>
    <span><strong>{meal.name}</strong><small>{meal.description}</small><Macros meal={meal} /></span>
    <em>{current ? 'Current' : selected ? 'Selected' : `${meal.prepMinutes} min`}</em>
  </button>
}

function ReplaceDialog({ selection, library, saving, onClose, onChoose, onReview, onApply }) {
  const [query, setQuery] = useState('')
  const candidates = useMemo(() => library.filter(meal => meal.mealType === selection.mealType && `${meal.name} ${meal.description}`.toLowerCase().includes(query.toLowerCase())), [library, query, selection.mealType])
  const currentMeal=library.find(meal=>meal.id===selection.day.meals[selection.mealType])
  const selectedMeal=library.find(meal=>meal.id===selection.mealId)
  useEffect(() => {
    const close = event => { if (event.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose, saving])

  return <div className="meal-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="meal-dialog" role="dialog" aria-modal="true" aria-labelledby="meal-dialog-title">
      <header><div><span>Meal library · 30 options</span><h2 id="meal-dialog-title">Replace {LABELS[selection.mealType]}</h2><p>{formatDay(selection.day.date)}</p></div><button type="button" onClick={onClose} disabled={saving} aria-label="Close"><i className="ti ti-x" /></button></header>
      <label className="meal-search"><i className="ti ti-search" /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${LABELS[selection.mealType].toLowerCase()} options`} /></label>
      <div className="meal-choice-list">{candidates.map(meal => <MealChoice key={meal.id} meal={meal} current={meal.id === selection.day.meals[selection.mealType]} selected={meal.id === selection.mealId} onChoose={() => onChoose(meal.id)} />)}</div>
      <footer className="meal-dialog-review">
        <div><span>{selection.proposal?'Reviewed change':'Selection'}</span><strong>{currentMeal?.name||'Current meal'} <i className="ti ti-arrow-right" /> {selectedMeal?.name||'Choose a replacement'}</strong>{selection.proposal&&<small>This exact replacement and meal-plan version are ready to apply. It will be recorded in Audit History and can be safely undone.</small>}</div>
        <div><button type="button" onClick={onClose} disabled={saving}>Cancel</button>{selection.proposal?<button type="button" className="is-primary" onClick={()=>onApply(selection.proposal.id)} disabled={saving}>{saving?'Applying…':'Apply reviewed change'}</button>:<button type="button" className="is-primary" onClick={onReview} disabled={saving||!selectedMeal||selectedMeal.id===currentMeal?.id}>{saving?'Preparing review…':'Review change'}</button>}</div>
      </footer>
    </section>
  </div>
}

function PlanView({ days, onSelect }) {
  return <div className="meal-week">
    {days.map((day, index) => <article className={`meal-day${index === 0 ? ' meal-day--today' : ''}`} key={day.date}>
      <header><div><span>{index === 0 ? 'Today' : `Day ${index + 1}`}</span><h2>{formatDay(day.date)}</h2></div>{Object.keys(day.substitutions || {}).length > 0 && <small><i className="ti ti-replace" /> Customized</small>}</header>
      <div className="meal-day-slots">{MEAL_TYPES.map(mealType => {
        const meal = day.resolvedMeals[mealType]
        return <section className="meal-slot" key={mealType}><img className="meal-slot-photo" src={meal?.image} alt={meal?.name || ''} loading={index === 0 ? 'eager' : 'lazy'} /><div className="meal-slot-heading"><div className="meal-slot-icon"><i className={`ti ${ICONS[mealType]}`} /></div><div><span>{LABELS[mealType]}</span><strong>{meal?.name}</strong></div></div><p>{meal?.description}</p>{meal && <Macros meal={meal} />}<div className="meal-slot-footer"><small>{meal?.prepMinutes} minutes</small><button type="button" onClick={() => onSelect({ day, mealType })}><i className="ti ti-replace" /> Replace</button></div></section>
      })}</div>
    </article>)}
  </div>
}

function LibraryView({ library, onSelect }) {
  return <div className="meal-library">{MEAL_TYPES.map(mealType => <section key={mealType}><header><div className="meal-library-icon"><i className={`ti ${ICONS[mealType]}`} /></div><div><span>30 choices</span><h2>{LABELS[mealType]}</h2></div></header><div className="meal-library-grid">{library.filter(meal => meal.mealType === mealType).map(meal => <article key={meal.id}><img src={meal.image} alt={meal.name} loading="lazy" /><div className="meal-library-copy"><div><strong>{meal.name}</strong><span>{meal.prepMinutes} min</span></div><p>{meal.description}</p><Macros meal={meal} /></div></article>)}</div><footer>Nutrition values are per plated serving and are estimates; ingredients and preparation change actual values.</footer></section>)}</div>
}

export default function MealPlanner() {
  const { data, state, error, reload, prepareReplacement, applyReplacement } = useRollingMealPlan()
  const [view, setView] = useState('plan')
  const [selection, setSelection] = useState(null)
  const [message, setMessage] = useState('')
  const planInsight = useMemo(() => summarizeMealPlan(data?.days), [data])

  const chooseReplacement = mealId => setSelection(current=>({...current,mealId,proposal:null}))

  const reviewReplacement = async () => {
    setMessage('')
    try {
      const proposal=await prepareReplacement({date:selection.day.date,mealType:selection.mealType,mealId:selection.mealId,expectedVersion:selection.day.version})
      setSelection(current=>current&&current.mealId===selection.mealId?{...current,proposal}:current)
    } catch (replaceError) {
      setMessage(replaceError.status === 409 ? 'The plan changed on another device. Refreshing the latest version…' : replaceError.message)
      if (replaceError.status === 409) await reload().catch(() => undefined)
    }
  }

  const applyReviewedReplacement = async proposalId => {
    setMessage('')
    try {
      await applyReplacement(proposalId)
      setSelection(null)
      setMessage('Meal replaced after review. The change is recorded in Action Mode Audit History and can be safely undone.')
    } catch (replaceError) {
      setMessage(replaceError.status === 409 ? 'The plan changed after review. Refreshing the latest version…' : replaceError.message)
      if (replaceError.status === 409) await reload().catch(() => undefined)
    }
  }

  return <main className="meal-planner">
    <header className="meal-planner-hero"><div><p>Health &amp; Nutrition</p><h1>Rolling 7-Day Meal Plan</h1><span>Three meals a day, always planned. Lunch and dinner stay simple: protein plus vegetables.</span></div><div className="meal-plan-stat"><strong>90</strong><span>household meals</span></div></header>
    <div className="meal-planner-controls"><nav aria-label="Meal planner views"><button type="button" className={view === 'plan' ? 'is-active' : ''} onClick={() => setView('plan')}><i className="ti ti-calendar-week" /> 7-Day Plan</button><button type="button" className={view === 'library' ? 'is-active' : ''} onClick={() => setView('library')}><i className="ti ti-tools-kitchen-2" /> Meal Library</button></nav><p><i className="ti ti-refresh" /> The window rolls forward daily; replacements remain attached to their date.</p></div>
    {message && <div className="meal-planner-message" role="status">{message}</div>}
    {data && view === 'plan' && planInsight && <section className="meal-plan-insight" aria-label="Meal plan insight"><div><span>Plan insight</span><strong>{planInsight.tomorrowDinner ? `Tomorrow’s dinner is ${planInsight.tomorrowDinner.name}.` : `${planInsight.mealCount} meals are planned.`}</strong><p>{planInsight.tomorrowDinner ? `It is scheduled for ${planInsight.tomorrowDinner.prepMinutes} minutes, so the useful preparation is making sure its main ingredients are available before tomorrow.` : `The plan represents about ${planInsight.totalPrepMinutes} minutes of preparation.`}</p></div><dl><div><dt>Planned prep</dt><dd>{planInsight.totalPrepMinutes} min</dd></div><div><dt>Avg. planned protein</dt><dd>{planInsight.averageProteinGrams}g</dd></div><div><dt>Longest preparation</dt><dd>{planInsight.longestPrep.name} · {planInsight.longestPrep.prepMinutes} min</dd></div></dl><small>These are plan estimates, not evidence that a meal was prepared or eaten.</small></section>}
    {state === 'loading' && !data && <div className="meal-planner-state"><i className="ti ti-loader-2" /> Preparing the household meal plan…</div>}
    {error && !data && <div className="meal-planner-state meal-planner-state--error"><strong>Meal plan needs attention</strong><span>{error}</span><button type="button" onClick={() => reload().catch(() => undefined)}>Retry</button></div>}
    {data && (view === 'plan' ? <PlanView days={data.days} onSelect={({day,mealType})=>setSelection({day,mealType,mealId:day.meals[mealType],proposal:null})} /> : <LibraryView library={data.library} onSelect={setSelection} />)}
    {selection && <ReplaceDialog selection={selection} library={data.library} saving={state === 'saving'} onClose={() => setSelection(null)} onChoose={chooseReplacement} onReview={reviewReplacement} onApply={applyReviewedReplacement} />}
  </main>
}
