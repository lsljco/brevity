import { useEffect, useMemo, useState } from 'react'
import { MEAL_TYPES } from './mealLibrary.js'
import { useRollingMealPlan } from './useRollingMealPlan.js'
import { summarizeMealPlan } from './mealPlanInsights.js'
import './MealPlanner.css'
import './MealPlannerInsights.css'

const LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }
const ICONS = { breakfast: 'ti-sunrise', lunch: 'ti-sun-high', dinner: 'ti-moon-stars' }

const formatDay = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const formatPrepMinutes = value => {
  const total = Math.max(0, Math.round(Number(value) || 0))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (!hours) return `${minutes} min`
  return `${hours} hr${hours === 1 ? '' : 's'}${minutes ? ` ${minutes} min` : ''}`
}

function MealImage({ meal, className = '', loading = 'lazy', alt = '' }) {
  if (meal?.image) return <img className={className} src={meal.image} alt={alt} loading={loading} />
  return <div className={`meal-image-placeholder ${className}`} role="img" aria-label={alt || meal?.name || 'Meal photo not added'}><i className="ti ti-tools-kitchen-2" /><span>Photo not added</span></div>
}

function Macros({ meal }) {
  return <div className="meal-macros" aria-label={`Estimated nutrition per ${meal.serving}`} title={meal.nutritionBasis}><span><strong>{meal.macros.calories}</strong> cal</span><span><strong>{meal.macros.proteinGrams}g</strong> protein</span><span><strong>{meal.macros.carbohydrateGrams}g</strong> carbs</span><span><strong>{meal.macros.fatGrams}g</strong> fat</span></div>
}

function MealChoice({ meal, onChoose, selected, current }) {
  return <button type="button" className={`meal-choice${selected ? ' is-selected' : ''}`} onClick={onChoose}>
    <MealImage meal={meal} alt="" />
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
      <header><div><span>Meal library · {candidates.length} options</span><h2 id="meal-dialog-title">Replace {LABELS[selection.mealType]}</h2><p>{formatDay(selection.day.date)}</p></div><button type="button" onClick={onClose} disabled={saving} aria-label="Close"><i className="ti ti-x" /></button></header>
      <label className="meal-search"><i className="ti ti-search" /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${LABELS[selection.mealType].toLowerCase()} options`} /></label>
      <div className="meal-choice-list">{candidates.map(meal => <MealChoice key={meal.id} meal={meal} current={meal.id === selection.day.meals[selection.mealType]} selected={meal.id === selection.mealId} onChoose={() => onChoose(meal.id)} />)}</div>
      <footer className="meal-dialog-review">
        <div><span>{selection.proposal?'Reviewed change':'Selection'}</span><strong>{currentMeal?.name||'Current meal'} <i className="ti ti-arrow-right" /> {selectedMeal?.name||'Choose a replacement'}</strong>{selection.proposal&&<small>This exact replacement and meal-plan version are ready to apply. It will be recorded in Audit History and can be safely undone.</small>}</div>
        <div><button type="button" onClick={onClose} disabled={saving}>Cancel</button>{selection.proposal?<button type="button" className="is-primary" onClick={()=>onApply(selection.proposal.id)} disabled={saving}>{saving?'Applying…':'Apply reviewed change'}</button>:<button type="button" className="is-primary" onClick={onReview} disabled={saving||!selectedMeal||selectedMeal.id===currentMeal?.id}>{saving?'Preparing review…':'Review change'}</button>}</div>
      </footer>
    </section>
  </div>
}

function AddMealDialog({ mealType, saving, onClose, onSave }) {
  const [form, setForm] = useState({
    mealType,
    name:'',
    description:'',
    ingredients:'',
    prepMinutes:'',
    cookMinutes:'',
    totalMinutes:'',
    image:'',
    serving:'1 serving',
    calories:'',
    proteinGrams:'',
    carbohydrateGrams:'',
    fatGrams:'',
  })
  const set = (field, value) => setForm(current => ({ ...current, [field]:value }))
  const submit = event => {
    event.preventDefault()
    onSave({
      mealType:form.mealType,
      name:form.name.trim(),
      description:form.description.trim(),
      ingredients:form.ingredients.split(/\r?\n/).map(value=>value.trim()).filter(Boolean),
      prepMinutes:Number(form.prepMinutes),
      cookMinutes:Number(form.cookMinutes),
      totalMinutes:form.totalMinutes===''?undefined:Number(form.totalMinutes),
      image:form.image.trim(),
      serving:form.serving.trim() || '1 serving',
      macros:{
        calories:Number(form.calories),
        proteinGrams:Number(form.proteinGrams),
        carbohydrateGrams:Number(form.carbohydrateGrams),
        fatGrams:Number(form.fatGrams),
      },
    })
  }

  useEffect(() => {
    const close = event => { if (event.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose, saving])

  return <div className="meal-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="meal-dialog meal-add-dialog" role="dialog" aria-modal="true" aria-labelledby="meal-add-title">
      <header><div><span>Household meal library</span><h2 id="meal-add-title">Add a meal</h2><p>Add it once and it will be available as a replacement on any device.</p></div><button type="button" onClick={onClose} disabled={saving} aria-label="Close"><i className="ti ti-x" /></button></header>
      <form className="meal-add-form" onSubmit={submit}>
        <label><span>Meal type</span><select value={form.mealType} onChange={event=>set('mealType',event.target.value)}>{MEAL_TYPES.map(type=><option key={type} value={type}>{LABELS[type]}</option>)}</select></label>
        <label className="meal-add-form--wide"><span>Meal name</span><input autoFocus required value={form.name} onChange={event=>set('name',event.target.value)} placeholder="Steak and Loaded Mashed Potatoes" /></label>
        <label className="meal-add-form--wide"><span>Description</span><textarea value={form.description} onChange={event=>set('description',event.target.value)} placeholder="Brief description of the plated meal" /></label>
        <label className="meal-add-form--wide"><span>Ingredients <small>one per line</small></span><textarea value={form.ingredients} onChange={event=>set('ingredients',event.target.value)} placeholder={'Steak\nPotatoes\nButter'} /></label>
        <label><span>Prep time (minutes)</span><input required min="0" step="1" type="number" value={form.prepMinutes} onChange={event=>set('prepMinutes',event.target.value)} /></label>
        <label><span>Cook time (minutes)</span><input required min="0" step="1" type="number" value={form.cookMinutes} onChange={event=>set('cookMinutes',event.target.value)} /></label>
        <label><span>Total time (minutes) <small>optional override</small></span><input min="0" step="1" type="number" value={form.totalMinutes} onChange={event=>set('totalMinutes',event.target.value)} /></label>
        <label><span>Serving</span><input value={form.serving} onChange={event=>set('serving',event.target.value)} /></label>
        <label><span>Calories</span><input required min="0" step="1" type="number" value={form.calories} onChange={event=>set('calories',event.target.value)} /></label>
        <label><span>Protein (g)</span><input required min="0" step="1" type="number" value={form.proteinGrams} onChange={event=>set('proteinGrams',event.target.value)} /></label>
        <label><span>Carbs (g)</span><input required min="0" step="1" type="number" value={form.carbohydrateGrams} onChange={event=>set('carbohydrateGrams',event.target.value)} /></label>
        <label><span>Fat (g)</span><input required min="0" step="1" type="number" value={form.fatGrams} onChange={event=>set('fatGrams',event.target.value)} /></label>
        <label className="meal-add-form--wide"><span>Photo URL <small>optional</small></span><input type="url" value={form.image} onChange={event=>set('image',event.target.value)} placeholder="https://…" /></label>
        <footer><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="is-primary" disabled={saving}>{saving?'Adding meal…':'Add to Meal Library'}</button></footer>
      </form>
    </section>
  </div>
}

function PlanView({ days, onSelect }) {
  return <div className="meal-week">
    {days.map((day, index) => <article className={`meal-day${index === 0 ? ' meal-day--today' : ''}`} key={day.date}>
      <header><div><span>{index === 0 ? 'Today' : `Day ${index + 1}`}</span><h2>{formatDay(day.date)}</h2></div>{Object.keys(day.substitutions || {}).length > 0 && <small><i className="ti ti-replace" /> Customized</small>}</header>
      <div className="meal-day-slots">{MEAL_TYPES.map(mealType => {
        const meal = day.resolvedMeals[mealType]
        return <section className="meal-slot" key={mealType}><MealImage meal={meal} className="meal-slot-photo" alt={meal?.name || ''} loading={index === 0 ? 'eager' : 'lazy'} /><div className="meal-slot-heading"><div className="meal-slot-icon"><i className={`ti ${ICONS[mealType]}`} /></div><div><span>{LABELS[mealType]}</span><strong>{meal?.name}</strong></div></div><p>{meal?.description}</p>{meal && <Macros meal={meal} />}<div className="meal-slot-footer"><small>{meal?.prepMinutes} minutes</small><button type="button" onClick={() => onSelect({ day, mealType })}><i className="ti ti-replace" /> Replace</button></div></section>
      })}</div>
    </article>)}
  </div>
}

function LibraryView({ library, onAdd }) {
  return <div className="meal-library">{MEAL_TYPES.map(mealType => {
    const meals = library.filter(meal => meal.mealType === mealType)
    return <section key={mealType}><header><div className="meal-library-heading"><div className="meal-library-icon"><i className={`ti ${ICONS[mealType]}`} /></div><div><span>{meals.length} choices</span><h2>{LABELS[mealType]}</h2></div></div><button type="button" className="meal-library-add" onClick={()=>onAdd(mealType)}><i className="ti ti-plus" /> Add {LABELS[mealType]}</button></header><div className="meal-library-grid">{meals.map(meal => <article key={meal.id}><MealImage meal={meal} alt={meal.name} /><div className="meal-library-copy"><div><strong>{meal.name}</strong><span>{meal.prepMinutes} min</span></div><p>{meal.description}</p><Macros meal={meal} /></div></article>)}</div><footer>Nutrition values are per plated serving and are estimates; ingredients and preparation change actual values.</footer></section>
  })}</div>
}

export default function MealPlanner() {
  const { data, state, error, reload, addMeal, prepareReplacement, applyReplacement } = useRollingMealPlan({reloadOnRefreshEvents:true})
  const [view, setView] = useState('plan')
  const [selection, setSelection] = useState(null)
  const [addingMealType, setAddingMealType] = useState('')
  const [message, setMessage] = useState('')
  const planInsight = useMemo(() => summarizeMealPlan(data?.days), [data])

  useEffect(()=>setSelection(current=>{
    if(!current)return current
    const currentDay=data?.days?.find(day=>day.date===current.day.date)
    return currentDay?.version===current.day.version?current:null
  }),[data])

  const chooseReplacement = mealId => setSelection(current=>({...current,mealId,proposal:null}))

  const saveMeal = async meal => {
    setMessage('')
    try {
      const created = await addMeal(meal)
      setAddingMealType('')
      setMessage(`${created.name} was added to the household Meal Library and is available for future meal replacements.`)
    } catch (addError) {
      if(addError.code==='STALE_MEAL_SCOPE')return
      setMessage(addError.message || 'Could not add this meal to the household library.')
    }
  }

  const reviewReplacement = async () => {
    setMessage('')
    try {
      const proposal=await prepareReplacement({date:selection.day.date,mealType:selection.mealType,mealId:selection.mealId,expectedVersion:selection.day.version})
      setSelection(current=>current&&current.mealId===selection.mealId?{...current,proposal}:current)
    } catch (replaceError) {
      if(replaceError.code==='STALE_MEAL_SCOPE')return
      setMessage(replaceError.status === 409 ? 'The plan changed on another device. Refreshing the latest version…' : replaceError.message)
      if (replaceError.status === 409) await reload().catch(() => undefined)
    }
  }

  const applyReviewedReplacement = async proposalId => {
    setMessage('')
    try {
      const applied=await applyReplacement(proposalId)
      if(applied.scopeChanged)return
      setSelection(null)
      setMessage(applied.refreshError?'Meal replaced and recorded in Action Mode Audit History, but the updated meal plan could not be reloaded. Retry the meal-plan refresh before making another replacement.':'Meal replaced after review. The change is recorded in Action Mode Audit History and can be safely undone.')
    } catch (replaceError) {
      if(replaceError.code==='STALE_MEAL_SCOPE')return
      setMessage(replaceError.status === 409 ? 'The plan changed after review. Refreshing the latest version…' : replaceError.message)
      if (replaceError.status === 409) await reload().catch(() => undefined)
    }
  }

  return <main className="meal-planner">
    <header className="meal-planner-hero"><div><p>Health &amp; Nutrition</p><h1>Rolling 7-Day Meal Plan</h1><span>Three meals a day, always planned. Lunch and dinner stay simple: protein plus vegetables.</span></div><div className="meal-plan-stat"><strong>{data?.librarySummary?.total ?? 90}</strong><span>household meals</span></div></header>
    <div className="meal-planner-controls"><nav aria-label="Meal planner views"><button type="button" className={view === 'plan' ? 'is-active' : ''} onClick={() => setView('plan')}><i className="ti ti-calendar-week" /> 7-Day Plan</button><button type="button" className={view === 'library' ? 'is-active' : ''} onClick={() => setView('library')}><i className="ti ti-tools-kitchen-2" /> Meal Library</button></nav><p><i className="ti ti-refresh" /> The window rolls forward daily; replacements remain attached to their date.</p></div>
    {message && <div className="meal-planner-message" role="status">{message}</div>}
    {data && view === 'plan' && planInsight && <section className="meal-plan-insight" aria-label="Meal plan insight"><div><span>Today’s plan insight</span><strong>{planInsight.mealCount} meals are planned for {formatDay(planInsight.selectedDate)}.</strong><p>The totals below aggregate breakfast, lunch, and dinner for this day. Preparation uses each meal’s total time, or prep time when no separate cook time exists.</p></div><dl><div><dt>Total planned time</dt><dd>{formatPrepMinutes(planInsight.totalPrepMinutes)}</dd></div><div><dt>Total calories</dt><dd>{planInsight.totalCalories.toLocaleString()} cal</dd></div><div><dt>Total protein</dt><dd>{planInsight.totalProteinGrams}g</dd></div><div><dt>Total carbs</dt><dd>{planInsight.totalCarbohydrateGrams}g</dd></div><div><dt>Total fat</dt><dd>{planInsight.totalFatGrams}g</dd></div><div><dt>Longest preparation</dt><dd>{planInsight.longestPrep.name} · {planInsight.longestPrep.prepMinutes} min</dd></div></dl><small>These are estimates for the three meals shown for this day, not evidence that a meal was prepared or eaten.</small></section>}
    {state === 'loading' && !data && <div className="meal-planner-state"><i className="ti ti-loader-2" /> Preparing the household meal plan…</div>}
    {error && !data && <div className="meal-planner-state meal-planner-state--error"><strong>Meal plan needs attention</strong><span>{error}</span><button type="button" onClick={() => reload().catch(() => undefined)}>Retry</button></div>}
    {error && data && <div className="meal-planner-state meal-planner-state--error"><strong>Meal plan refresh needed</strong><span>{error}</span><button type="button" onClick={() => reload().catch(() => undefined)}>Retry</button></div>}
    {data && (view === 'plan' ? <PlanView days={data.days} onSelect={({day,mealType})=>setSelection({day,mealType,mealId:day.meals[mealType],proposal:null})} /> : <LibraryView library={data.library} onAdd={setAddingMealType} />)}
    {selection && <ReplaceDialog selection={selection} library={data.library} saving={state === 'saving'} onClose={() => setSelection(null)} onChoose={chooseReplacement} onReview={reviewReplacement} onApply={applyReviewedReplacement} />}
    {addingMealType && <AddMealDialog mealType={addingMealType} saving={state === 'saving'} onClose={()=>setAddingMealType('')} onSave={saveMeal} />}
  </main>
}
