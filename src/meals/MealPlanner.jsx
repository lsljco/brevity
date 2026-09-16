import { useEffect, useMemo, useState } from 'react'
import { MEAL_TYPES } from './mealLibrary.js'
import { useRollingMealPlan } from './useRollingMealPlan.js'
import { summarizeMealPlan } from './mealPlanInsights.js'
import { calculateMealNutrition, importRecipeFromUrl } from './mealPlanApi.js'
import { requestActionReview } from '../assistant/actionEvents.js'
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
  return <div className="meal-macros" aria-label={`Estimated nutrition per ${meal.serving}`} title={meal.nutritionBasis}><span><strong>{Number(meal.macros.calories).toLocaleString()}</strong> cal</span><span><strong>{meal.macros.proteinGrams}g</strong> protein</span><span><strong>{meal.macros.carbohydrateGrams}g</strong> carbs</span><span><strong>{meal.macros.fatGrams}g</strong> fat</span></div>
}

function MealChoice({ meal, onChoose, selected, current }) {
  return <button type="button" className={`meal-choice${selected ? ' is-selected' : ''}`} onClick={onChoose}>
    <MealImage meal={meal} alt="" />
    <span className="meal-choice-mark"><i className={`ti ${selected ? 'ti-circle-check-filled' : 'ti-circle'}`} /></span>
    <span><strong>{meal.name}</strong><small>{meal.description}</small><Macros meal={meal} /></span>
    <em>{current ? 'Current' : selected ? 'Selected' : `${meal.prepMinutes} min`}</em>
  </button>
}

function ReplaceDialog({ selection, library, saving, error, onClose, onChoose, onReview }) {
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
        <div><span>Selection</span><strong>{currentMeal?.name||'Current meal'} <i className="ti ti-arrow-right" /> {selectedMeal?.name||'Choose a replacement'}</strong><small>Review opens Action Mode. Nothing changes until you confirm there, and the completed change can be undone from Audit History.</small>{error&&<small className="meal-dialog-error" role="alert">{error}</small>}</div>
        <div><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="is-primary" onClick={onReview} disabled={saving||!selectedMeal||selectedMeal.id===currentMeal?.id}>{saving?'Opening review…':'Review change'}</button></div>
      </footer>
    </section>
  </div>
}

function AddMealDialog({ mealType, saving, error, onClose, onSave }) {
  const [form, setForm] = useState({
    mealType,
    name:'',
    description:'',
    ingredients:'',
    prepMinutes:'',
    cookMinutes:'',
    totalMinutes:'',
    yieldQuantity:'',
    yieldUnit:'servings',
    sourceUrl:'',
    sourceName:'',
  })
  const [recipeUrl,setRecipeUrl]=useState('')
  const [importState,setImportState]=useState('idle')
  const [importError,setImportError]=useState('')
  const [importNotice,setImportNotice]=useState('')
  const [nutrition,setNutrition]=useState(null)
  const [nutritionState,setNutritionState]=useState('idle')
  const [nutritionError,setNutritionError]=useState('')
  const set = (field, value) => {
    setForm(current => ({ ...current, [field]:value }))
    if(['ingredients','yieldQuantity','yieldUnit'].includes(field)){setNutrition(null);setNutritionError('');setNutritionState('idle')}
  }
  const ingredientLines=value=>(value??form.ingredients).split(/\r?\n/).map(line=>line.trim()).filter(Boolean)
  const calculateFor=async(ingredients,yieldQuantity,yieldUnit)=>{
    setNutritionState('loading');setNutritionError('')
    try{
      const result=await calculateMealNutrition(ingredients,Number(yieldQuantity),yieldUnit.trim())
      setNutrition(result.nutrition);setNutritionState('ready')
      return true
    }catch(error){setNutrition(null);setNutritionError(error.message||'Could not calculate nutrition.');setNutritionState('error');return false}
  }
  const calculate=()=>calculateFor(ingredientLines(),form.yieldQuantity,form.yieldUnit)
  const importFromWebsite=async()=>{
    setImportState('loading');setImportError('');setImportNotice('');setNutrition(null);setNutritionError('');setNutritionState('idle')
    try{
      const result=await importRecipeFromUrl(recipeUrl.trim())
      const recipe=result.recipe
      const ingredients=(recipe.ingredients||[]).join('\n')
      const yieldQuantity=recipe.yieldQuantity??''
      const yieldUnit=recipe.yieldUnit||'servings'
      setForm(current=>({
        ...current,
        mealType:recipe.mealType||current.mealType,
        name:recipe.name||'',
        description:recipe.description||'',
        ingredients,
        prepMinutes:recipe.prepMinutes??'',
        cookMinutes:recipe.cookMinutes??'',
        totalMinutes:recipe.totalMinutes??'',
        yieldQuantity,
        yieldUnit,
        sourceUrl:recipe.sourceUrl||'',
        sourceName:recipe.sourceName||'',
      }))
      const missing=(recipe.missingFields||[]).join(', ')
      setImportNotice(`Imported from ${recipe.sourceName}.${missing?` Please enter the missing ${missing}.`:' Review the populated fields before saving.'}`)
      setImportState('ready')
      if(ingredients&&Number(yieldQuantity)>0&&yieldUnit)await calculateFor(ingredientLines(ingredients),yieldQuantity,yieldUnit)
    }catch(error){setImportError(error.message||'Could not import that recipe.');setImportState('error')}
  }
  const submit = event => {
    event.preventDefault()
    if(!nutrition)return
    onSave({
      mealType:form.mealType,
      name:form.name.trim(),
      description:form.description.trim(),
      ingredients:ingredientLines(),
      prepMinutes:Number(form.prepMinutes),
      cookMinutes:Number(form.cookMinutes),
      totalMinutes:form.totalMinutes===''?undefined:Number(form.totalMinutes),
      serving:nutrition.serving,
      yieldQuantity:nutrition.yieldQuantity,
      yieldUnit:nutrition.yieldUnit,
      macros:nutrition.perServingMacros,
      batchMacros:nutrition.batchMacros,
      ingredientNutrition:nutrition.ingredients,
      nutritionWarnings:nutrition.warnings,
      nutritionBasis:nutrition.nutritionBasis,
      sourceUrl:form.sourceUrl,
      sourceName:form.sourceName,
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
        <section className="meal-recipe-import meal-add-form--wide" aria-labelledby="recipe-import-title">
          <div><strong id="recipe-import-title">Import from a recipe website</strong><span>Paste the recipe page URL. Brevity will populate an editable draft and calculate nutrition from its measured ingredients.</span></div>
          <div className="meal-recipe-import-controls"><label><span>Recipe website URL</span><input autoFocus type="url" required={false} value={recipeUrl} onChange={event=>setRecipeUrl(event.target.value)} placeholder="https://example.com/recipe" /></label><button type="button" onClick={importFromWebsite} disabled={saving||importState==='loading'||!recipeUrl.trim()}>{importState==='loading'?'Importing…':'Import recipe'}</button></div>
          {importError&&<div className="meal-nutrition-error" role="alert">{importError}</div>}
          {importNotice&&<div className="meal-recipe-import-notice" role="status">{importNotice}{form.sourceUrl&&<a href={form.sourceUrl} target="_blank" rel="noreferrer">View source</a>}</div>}
        </section>
        <label><span>Meal type</span><select value={form.mealType} onChange={event=>set('mealType',event.target.value)}>{MEAL_TYPES.map(type=><option key={type} value={type}>{LABELS[type]}</option>)}</select></label>
        <label className="meal-add-form--wide"><span>Meal name</span><input required value={form.name} onChange={event=>set('name',event.target.value)} placeholder="Steak and Loaded Mashed Potatoes" /></label>
        <label className="meal-add-form--wide"><span>Description</span><textarea value={form.description} onChange={event=>set('description',event.target.value)} placeholder="Brief description of the plated meal" /></label>
        <label className="meal-add-form--wide"><span>Measured ingredients <small>one per line; include brand, amount and unit</small></span><textarea required value={form.ingredients} onChange={event=>set('ingredients',event.target.value)} placeholder={'2 cups Pearl Milling Company pancake mix\n1 cup water\n1 stick salted butter'} /></label>
        <label><span>Prep time (minutes)</span><input required min="0" step="1" type="number" value={form.prepMinutes} onChange={event=>set('prepMinutes',event.target.value)} /></label>
        <label><span>Cook time (minutes)</span><input required min="0" step="1" type="number" value={form.cookMinutes} onChange={event=>set('cookMinutes',event.target.value)} /></label>
        <label><span>Total time (minutes) <small>optional override</small></span><input min="0" step="1" type="number" value={form.totalMinutes} onChange={event=>set('totalMinutes',event.target.value)} /></label>
        <label><span>Batch yield</span><input required min="0.1" max="500" step="0.1" type="number" value={form.yieldQuantity} onChange={event=>set('yieldQuantity',event.target.value)} placeholder="12" /></label>
        <label><span>Yield unit</span><input required value={form.yieldUnit} onChange={event=>set('yieldUnit',event.target.value)} placeholder="pancakes" /></label>
        <div className="meal-nutrition-action meal-add-form--wide"><div><strong>Nutrition from ingredients</strong><span>Brevity totals the full batch, then divides it by the batch yield.</span></div><button type="button" onClick={calculate} disabled={saving||nutritionState==='loading'||!ingredientLines().length||!Number(form.yieldQuantity)||!form.yieldUnit.trim()}>{nutritionState==='loading'?'Calculating…':nutrition?'Recalculate nutrition':'Calculate nutrition'}</button></div>
        {nutritionError&&<div className="meal-nutrition-error meal-add-form--wide" role="alert">{nutritionError}</div>}
        {nutrition&&<section className="meal-nutrition-preview meal-add-form--wide" aria-label="Calculated nutrition preview">
          <header><div><span>Calculated estimate</span><strong>Total batch and per {nutrition.serving}</strong></div></header>
          <div className="meal-nutrition-totals"><article><span>Total batch</span><Macros meal={{serving:'batch',macros:nutrition.batchMacros,nutritionBasis:nutrition.nutritionBasis}} /></article><article><span>Per {nutrition.serving}</span><Macros meal={{serving:nutrition.serving,macros:nutrition.perServingMacros,nutritionBasis:nutrition.nutritionBasis}} /></article></div>
          <details><summary>Ingredient calculation details</summary>{nutrition.ingredients.map((ingredient,index)=><div className="meal-nutrition-row" key={`${ingredient.input}-${index}`}><div><strong>{ingredient.input}</strong><small>{ingredient.resolvedName} · {ingredient.basis} · {ingredient.confidence} confidence</small></div><span>{ingredient.macros.calories} cal · {ingredient.macros.proteinGrams}g P · {ingredient.macros.carbohydrateGrams}g C · {ingredient.macros.fatGrams}g F</span></div>)}</details>
          {nutrition.warnings.length>0&&<ul>{nutrition.warnings.map((warning,index)=><li key={`${warning}-${index}`}>{warning}</li>)}</ul>}
          <small>{nutrition.nutritionBasis}</small>
        </section>}
        <div className="meal-image-generation-note meal-add-form--wide"><i className="ti ti-photo-spark" /><div><strong>Meal image generated by Brevity</strong><span>When you save, Brevity creates an ultra-photorealistic editorial food image styled to match the Meal Library.</span></div></div>
        {error&&<div className="meal-nutrition-error meal-add-form--wide" role="alert">{error}</div>}
        <footer><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="is-primary" disabled={saving||!nutrition}>{saving?'Generating image and adding meal…':'Add to Meal Library'}</button></footer>
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
  const { data, state, error, reload, addMeal, prepareReplacement } = useRollingMealPlan({reloadOnRefreshEvents:true})
  const [view, setView] = useState('plan')
  const [selection, setSelection] = useState(null)
  const [addingMealType, setAddingMealType] = useState('')
  const [message, setMessage] = useState('')
  const [replacementError, setReplacementError] = useState('')
  const [addMealError, setAddMealError] = useState('')
  const planInsight = useMemo(() => summarizeMealPlan(data?.days), [data])

  useEffect(()=>setSelection(current=>{
    if(!current)return current
    const currentDay=data?.days?.find(day=>day.date===current.day.date)
    return currentDay?.version===current.day.version?current:null
  }),[data])

  const chooseReplacement = mealId => { setReplacementError(''); setSelection(current=>({...current,mealId,proposal:null})) }

  const saveMeal = async meal => {
    setMessage('')
    setAddMealError('')
    try {
      const created = await addMeal(meal)
      setAddingMealType('')
      setMessage(`${created.name} was added to the household Meal Library and is available for future meal replacements.`)
    } catch (addError) {
      if(addError.code==='STALE_MEAL_SCOPE')return
      setAddMealError(addError.message || 'Could not generate the meal image or add this meal to the household library.')
    }
  }

  const reviewReplacement = async () => {
    setMessage('')
    setReplacementError('')
    try {
      const proposal=await prepareReplacement({date:selection.day.date,mealType:selection.mealType,mealId:selection.mealId,expectedVersion:selection.day.version})
      if(!requestActionReview(proposal))throw new Error('Action Mode could not open the meal replacement review.')
      setSelection(null)
    } catch (replaceError) {
      if(replaceError.code==='STALE_MEAL_SCOPE')return
      setReplacementError(replaceError.status === 409 ? 'The plan changed on another device. Refreshing the latest version…' : replaceError.message||'Brevity could not prepare this meal replacement.')
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
    {selection && <ReplaceDialog selection={selection} library={data.library} saving={state === 'saving'} error={replacementError} onClose={() => { setReplacementError(''); setSelection(null) }} onChoose={chooseReplacement} onReview={reviewReplacement} />}
    {addingMealType && <AddMealDialog mealType={addingMealType} saving={state === 'saving'} error={addMealError} onClose={()=>{setAddMealError('');setAddingMealType('')}} onSave={saveMeal} />}
  </main>
}
