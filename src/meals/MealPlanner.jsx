import MealPreferences from './MealPreferences.jsx'
import {MEAL_SEASONS} from './mealPreferences.js'
import {saveMealPreferences} from './mealPlanApi.js'
import RecipeCsvImport from './RecipeCsvImport.jsx'
import MealCalendar from './MealCalendar.jsx'
import ScheduledMealEditor from './ScheduledMealEditor.jsx'
import {prepareDirectAction} from '../assistant/assistantApi.js'
import {normalizeMealScheduleCommand,householdIngredients,scaleIngredient,containsSeafood} from './householdMealPlanning.js'
import WeeklyGroceries from '../household/WeeklyGroceries.jsx'
import {LIBRARY_CATEGORIES,LIBRARY_CATEGORY_LABELS,libraryCategory,libraryCategoryLabel,mealReadyForPlanning,mealCategoryLabel} from './mealCategories.js'
import MealEditDialog from './MealEditDialog.jsx'
import PackagedFoodForm from './PackagedFoodForm.jsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { searchMeals } from './mealSearch.js'
import { mealMonthRange } from './mealMonth.js'
import { getHouseholdDateKey } from '../finance/financeTime.js'
import { useRollingMealPlan } from './useRollingMealPlan.js'
import { summarizeMealPlan } from './mealPlanInsights.js'
import { mealImageState, ensureMealImage, calculateMealNutrition, importMealsFromImage, importRecipeFromUrl, regenerateMealImage, uploadMealImage } from './mealPlanApi.js'
import { requestActionReview } from '../assistant/actionEvents.js'
import BulkMealImport from './BulkMealImport.jsx'
import ConsumedNutrition from './ConsumedNutrition.jsx'
import './MealPlanner.css'
import './MealPlannerInsights.css'

const LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack1: 'Snack 1', snack2: 'Snack 2', ingredient:'Ingredient' }
const ICONS = { breakfast: 'ti-sunrise', lunch: 'ti-sun-high', dinner: 'ti-moon-stars', snack1: 'ti-bottle', snack2: 'ti-apple', ingredient:'ti-carrot' }

const formatDay = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const formatPrepMinutes = value => {
  const total = Math.max(0, Math.round(Number(value) || 0))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (!hours) return `${minutes} min`
  return `${hours} hr${hours === 1 ? '' : 's'}${minutes ? ` ${minutes} min` : ''}`
}
const mealTimingLabel = meal => meal?.timingRecorded === false ? 'Time not recorded' : formatPrepMinutes(meal?.totalMinutes ?? meal?.prepMinutes)

function MealImage({ meal, className = '', loading = 'lazy', alt = '' }) {
  const [automatic,setAutomatic]=useState(()=>mealImageState(meal?.id))
  useEffect(()=>{const changed=event=>{if(event.detail?.mealId===meal?.id)setAutomatic(event.detail.state)};window.addEventListener('brevity-meal-image-state',changed);return()=>window.removeEventListener('brevity-meal-image-state',changed)},[meal?.id])
  if (meal?.image) return <img className={className} src={meal.image} alt={alt} loading={loading} />
  return <div className={`meal-image-placeholder ${className}`} role="img" aria-label={alt || meal?.name || 'Meal photo not added'}><i className="ti ti-tools-kitchen-2" /><span>{automatic==='queued'?'Photo queued automatically':automatic==='generating'?'Generating meal photo…':automatic==='error'?'Photo generation needs retry':'Photo not added'}</span></div>
}

function Macros({ meal }) {
  return <div className="meal-macros" aria-label={`Estimated nutrition per ${meal.serving}`} title={meal.nutritionBasis}><span><strong>{meal.macros.calories==null?'—':Number(meal.macros.calories).toLocaleString()}</strong> cal</span><span><strong>{meal.macros.proteinGrams??'—'}g</strong> protein</span><span><strong>{meal.macros.carbohydrateGrams??'—'}g</strong> carbs</span><span><strong>{meal.macros.fatGrams??'—'}g</strong> fat</span></div>
}

function MealDetailDialog({ meal, onClose, onImageGenerated, onEdit, onSwap, onPreferences }) {
  const ingredients = Array.isArray(meal?.ingredients) ? meal.ingredients : []
  const instructions = Array.isArray(meal?.instructions) ? meal.instructions : []
  const [imageState,setImageState]=useState(()=>['queued','generating'].includes(mealImageState(meal.id))?'loading':'idle')
  useEffect(()=>{const changed=event=>{if(event.detail?.mealId===meal.id){setImageState(['queued','generating'].includes(event.detail.state)?'loading':event.detail.state);if(event.detail.state==='error')setImageError('Automatic image generation could not finish. Use Generate New Image to retry.')}};window.addEventListener('brevity-meal-image-state',changed);return()=>window.removeEventListener('brevity-meal-image-state',changed)},[meal.id])
  const [imageError,setImageError]=useState('')
  const uploadInputId=`meal-image-upload-${meal.id}`
  const generateImage=async()=>{
    setImageState('loading');setImageError('')
    try{const result=await regenerateMealImage(meal.id);setImageState('ready');await onImageGenerated(result.meal)}
    catch(error){setImageState('error');setImageError(error.message||'Could not generate a new meal image.')}
  }
  const uploadImage=async event=>{
    const file=event.target.files?.[0];event.target.value=''
    if(!file)return
    setImageState('uploading');setImageError('')
    try{const result=await uploadMealImage(meal.id,file);setImageState('ready');await onImageGenerated(result.meal)}
    catch(error){setImageState('error');setImageError(error.message||'Could not upload that meal image.')}
  }
  useEffect(() => {
    const close = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])
  return <div className="meal-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="meal-dialog meal-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="meal-detail-title">
      <header><div><span>{libraryCategoryLabel(meal)}</span><h2 id="meal-detail-title">{meal.name}</h2><p>{meal.description}</p></div><button type="button" onClick={onClose} aria-label="Close meal details"><i className="ti ti-x" /></button></header>
      <div className="meal-detail-body">{onSwap&&<button className="meal-edit-button" type="button" onClick={onSwap}>Swap meal</button>}<button className="meal-edit-button" type="button" onClick={onEdit}><i className="ti ti-edit" aria-hidden="true" /> Edit meal</button>
        {onPreferences&&<MealPreferences meal={meal} onSave={onPreferences}/>}
        {!mealReadyForPlanning(meal)&&<div role="status"><strong>Recipe needs review before planning</strong>{meal.nutritionWarnings?.map((warning,i)=><p key={i}>{warning}</p>)}</div>}
        <MealImage meal={meal} className="meal-detail-image" alt={meal.name} loading="eager" />
        {!meal.id.startsWith('scheduled-')&&<div className="meal-detail-image-action"><div><strong>Meal photo</strong><span>Upload your own photo, or generate one from this exact ingredient list in Brevity’s luxury steakhouse aesthetic.</span></div><div className="meal-detail-image-buttons"><input id={uploadInputId} type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadImage} disabled={imageState==='loading'||imageState==='uploading'} /><label htmlFor={uploadInputId} aria-disabled={imageState==='loading'||imageState==='uploading'}><i className="ti ti-upload" /> {imageState==='uploading'?'Uploading…':'Upload Image'}</label><button type="button" onClick={generateImage} disabled={imageState==='loading'||imageState==='uploading'||!ingredients.length}><i className="ti ti-photo-spark" /> {imageState==='loading'?'Generating…':'Generate New Image'}</button></div></div>}
        {imageError&&<div className="meal-nutrition-error" role="alert">{imageError}</div>}
        <div className="meal-detail-facts">{meal.timingRecorded === false ? <span><strong>Not recorded</strong> preparation time</span> : <><span><strong>{formatPrepMinutes(meal.totalMinutes ?? meal.prepMinutes)}</strong> total</span><span><strong>{formatPrepMinutes(meal.prepMinutes)}</strong> prep</span>{Number(meal.cookMinutes) > 0 && <span><strong>{formatPrepMinutes(meal.cookMinutes)}</strong> cook</span>}</>}<span><strong>{meal.serving || '1 serving'}</strong> serving</span></div>
        <Macros meal={meal} />
        <section className="meal-quantity-columns"><div><h3>{meal.importReviewRequired?'Ingredients from source (batch)':'Ingredients per person'}</h3><ul>{ingredients.map((line,i)=><li key={i}>{meal.importReviewRequired?line:scaleIngredient(line,1/(Number(meal.yieldQuantity)||1))}</li>)}</ul></div>{!meal.importReviewRequired&&<div><h3>Prepare for {meal.plannedServings??6} people</h3><ul>{householdIngredients(meal,meal.plannedServings??6).map((line,i)=><li key={i}>{line}</li>)}</ul></div>}</section>
        <div className="meal-detail-columns">
          <section><h3>Recipe</h3>{instructions.length ? <ol>{instructions.map((instruction,index)=><li key={`${instruction}-${index}`}>{instruction}</li>)}</ol> : <p>{meal.description} Detailed preparation steps have not been recorded for this meal.</p>}</section>
        </div>
        {meal.nutritionBasis && <small className="meal-detail-note">{meal.nutritionBasis}</small>}
        {meal.sourceUrl && <a className="meal-detail-source" href={meal.sourceUrl} target="_blank" rel="noreferrer"><i className="ti ti-external-link" /> View original recipe{meal.sourceName ? ` at ${meal.sourceName}` : ''}</a>}
      </div>
    </section>
  </div>
}

function AddMealDialog({ mealType, saving, error, onClose, onSave }) {
  const [entryMode,setEntryMode]=useState('recipe')
  const [form, setForm] = useState({
    mealType,
    name:'',
    description:'',
    ingredients:'',
    instructions:'',
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
  const [imageMeals,setImageMeals]=useState([])
  const [imageImportState,setImageImportState]=useState('idle')
  const [imageImportError,setImageImportError]=useState('')
  const [imageWarnings,setImageWarnings]=useState([])
  const [imageNutrition,setImageNutrition]=useState(false)
  const [nutrition,setNutrition]=useState(null)
  const [nutritionState,setNutritionState]=useState('idle')
  const [nutritionError,setNutritionError]=useState('')
  const nutritionGeneration=useRef(0)
  const set = (field, value) => {
    setForm(current => ({ ...current, [field]:value }))
    if(['ingredients','yieldQuantity','yieldUnit'].includes(field)&&!imageNutrition){nutritionGeneration.current++;setNutrition(null);setNutritionError('');setNutritionState('idle')}
  }
  const ingredientLines=value=>(value??form.ingredients).split(/\r?\n/).map(line=>line.trim()).filter(Boolean)
  const calculateFor=async(ingredients,yieldQuantity,yieldUnit)=>{
    const generation=++nutritionGeneration.current
    setNutritionState('loading');setNutritionError('')
    try{
      const result=await calculateMealNutrition(ingredients,Number(yieldQuantity),yieldUnit.trim())
      if(generation!==nutritionGeneration.current)return false
      setNutrition(result.nutrition);setNutritionState('ready')
      return true
    }catch(error){if(generation!==nutritionGeneration.current)return false;setNutrition(null);setNutritionError(error.message||'Could not calculate nutrition.');setNutritionState('error');return false}
  }
  const calculate=()=>calculateFor(ingredientLines(),form.yieldQuantity,form.yieldUnit)
  const importFromWebsite=async()=>{
    nutritionGeneration.current++
    setImportState('loading');setImportError('');setImportNotice('');setNutrition(null);setNutritionError('');setNutritionState('idle')
    try{
      const result=await importRecipeFromUrl(recipeUrl.trim())
      const recipe=result.recipe
      const ingredients=(recipe.ingredients||[]).join('\n')
      const instructions=(recipe.instructions||[]).join('\n')
      const yieldQuantity=recipe.yieldQuantity??''
      const yieldUnit=recipe.yieldUnit||'servings'
      setForm(current=>({
        ...current,
        mealType:libraryCategory(recipe),
        name:recipe.name||'',
        description:recipe.description||'',
        ingredients,
        instructions,
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
  const chooseImageMeal=meal=>{
    nutritionGeneration.current++
    setForm(current=>({...current,mealType:libraryCategory(meal),name:meal.name,description:'',ingredients:meal.ingredients.join('\n'),instructions:'',prepMinutes:'',cookMinutes:'',totalMinutes:'',yieldQuantity:'1',yieldUnit:'plate',sourceUrl:'',sourceName:'Uploaded meal graphic'}))
    setImageWarnings(meal.warnings)
    const values=Object.values(meal.macros)
    setImageNutrition(values.every(value=>value!==null))
    setNutrition(values.every(value=>value!==null)?{serving:'1 plate',yieldQuantity:1,yieldUnit:'plate',perServingMacros:meal.macros,batchMacros:meal.macros,ingredients:[],warnings:meal.warnings,nutritionBasis:'Macros transcribed from an uploaded image; verify the figures and serving before saving.'}:null)
    setNutritionState(values.every(value=>value!==null)?'ready':'idle')
    setNutritionError(values.every(value=>value!==null)?'':'One or more macros are not legible. Enter measured ingredients and calculate nutrition before saving.')
  }
  const importFromImage=async event=>{
    const file=event.target.files?.[0];event.target.value=''
    if(!file)return
    setImageImportState('loading');setImageImportError('');setImageMeals([])
    try{
      const result=await importMealsFromImage(file)
      setImageMeals(result.meals||[]);setImageWarnings(result.warnings||[])
      if(result.meals?.length)chooseImageMeal(result.meals[0])
      setImageImportState('ready')
    }catch(error){setImageImportError(error.message||'Could not read that image.');setImageImportState('error')}
  }
  const submit = event => {
    event.preventDefault()
    if(!nutrition)return
    onSave({
      mealType:form.mealType,
      name:form.name.trim(),
      description:form.description.trim(),
      ingredients:ingredientLines(),
      instructions:form.instructions.split(/\r?\n/).map(line=>line.trim()).filter(Boolean),
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
      <div className="meal-replace-filters" role="group" aria-label="Meal entry method"><button type="button" aria-pressed={entryMode==='recipe'} disabled={saving} onClick={()=>setEntryMode('recipe')}>Recipe / image import</button><button type="button" aria-pressed={entryMode==='packaged'} disabled={saving} onClick={()=>setEntryMode('packaged')}>Packaged food / nutrition label</button></div>
      {entryMode==='packaged'?<PackagedFoodForm mealType={mealType} saving={saving} error={error} onClose={onClose} onSave={onSave}/>:<form className="meal-add-form" onSubmit={submit}>
        <section className="meal-recipe-import meal-add-form--wide" aria-labelledby="meal-image-import-title">
          <div><strong id="meal-image-import-title">Import meals from an image</strong><span>Upload a meal graphic. Brevity reads each plate and its printed macros into an editable draft. Check every value before adding a meal.</span></div>
          <label><span>Choose meal image</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={importFromImage} disabled={saving||imageImportState==='loading'} /></label>
          {imageImportState==='loading'&&<p role="status">Reading the meal image…</p>}
          {imageImportError&&<p role="alert">{imageImportError}</p>}
          {imageImportState==='ready'&&!imageMeals.length&&<p>No distinct meals were found in this image.</p>}
          {imageMeals.length>0&&<label><span>Choose a meal from the image ({imageMeals.length} found)</span><select onChange={event=>chooseImageMeal(imageMeals[Number(event.target.value)])}>{imageMeals.map((meal,index)=><option value={index} key={`${index}-${meal.name}`}>{meal.name}</option>)}</select></label>}
          {imageWarnings.length>0&&<ul>{imageWarnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>}
          {imageNutrition&&<div className="meal-image-macros"><strong>Printed macros per plate · confirm or correct</strong>{[['calories','Calories'],['proteinGrams','Protein (g)'],['carbohydrateGrams','Carbs (g)'],['fatGrams','Fat (g)']].map(([key,label])=><label key={key}><span>{label}</span><input type="number" min="0" step="1" value={nutrition?.perServingMacros?.[key]??''} onChange={event=>setNutrition(current=>({...current,perServingMacros:{...current.perServingMacros,[key]:Number(event.target.value)},batchMacros:{...current.batchMacros,[key]:Number(event.target.value)}}))} /></label>)}</div>}
        </section>
        <section className="meal-recipe-import meal-add-form--wide" aria-labelledby="recipe-import-title">
          <div><strong id="recipe-import-title">Import from a recipe website</strong><span>Paste the recipe page URL. Brevity will populate an editable draft and calculate nutrition from its measured ingredients.</span></div>
          <div className="meal-recipe-import-controls"><label><span>Recipe website URL</span><input autoFocus type="url" required={false} value={recipeUrl} onChange={event=>setRecipeUrl(event.target.value)} placeholder="https://example.com/recipe" /></label><button type="button" onClick={importFromWebsite} disabled={saving||importState==='loading'||!recipeUrl.trim()}>{importState==='loading'?'Importing…':'Import recipe'}</button></div>
          {importError&&<div className="meal-nutrition-error" role="alert">{importError}</div>}
          {importNotice&&<div className="meal-recipe-import-notice" role="status">{importNotice}{form.sourceUrl&&<a href={form.sourceUrl} target="_blank" rel="noreferrer">View source</a>}</div>}
        </section>
        <label><span>Library category</span><select value={form.mealType} onChange={event=>set('mealType',event.target.value)}>{LIBRARY_CATEGORIES.map(type=><option key={type} value={type}>{LIBRARY_CATEGORY_LABELS[type]}</option>)}</select></label>
        <label className="meal-add-form--wide"><span>Meal name</span><input required value={form.name} onChange={event=>set('name',event.target.value)} placeholder="Steak and Loaded Mashed Potatoes" /></label>
        <label className="meal-add-form--wide"><span>Description</span><textarea value={form.description} onChange={event=>set('description',event.target.value)} placeholder="Brief description of the plated meal" /></label>
        <label className="meal-add-form--wide"><span>Measured ingredients <small>one per line; include brand, amount and unit</small></span><textarea required value={form.ingredients} onChange={event=>set('ingredients',event.target.value)} placeholder={'2 cups Pearl Milling Company pancake mix\n1 cup water\n1 stick salted butter'} /></label>
        <label className="meal-add-form--wide"><span>Recipe steps <small>one step per line</small></span><textarea value={form.instructions} onChange={event=>set('instructions',event.target.value)} placeholder={'Season the ingredients.\nCook until done.\nPlate and serve.'} /></label>
        <label><span>Prep time (minutes)</span><input required min="0" step="1" type="number" value={form.prepMinutes} onChange={event=>set('prepMinutes',event.target.value)} /></label>
        <label><span>Cook time (minutes)</span><input required min="0" step="1" type="number" value={form.cookMinutes} onChange={event=>set('cookMinutes',event.target.value)} /></label>
        <label><span>Total time (minutes) <small>optional override</small></span><input min="0" step="1" type="number" value={form.totalMinutes} onChange={event=>set('totalMinutes',event.target.value)} /></label>
        <label><span>Batch yield</span><input required min="0.1" max="500" step="0.1" type="number" value={form.yieldQuantity} onChange={event=>set('yieldQuantity',event.target.value)} placeholder="12" /></label>
        <label><span>Yield unit</span><input required value={form.yieldUnit} onChange={event=>set('yieldUnit',event.target.value)} placeholder="pancakes" /></label>
        <div className="meal-nutrition-action meal-add-form--wide"><div><strong>{imageNutrition?'Nutrition printed in image':'Nutrition from ingredients'}</strong><span>{nutritionState==='loading'?'Calculating nutrition for the full batch. Larger recipes may take a couple of minutes. Keep this window open.':imageNutrition?'Confirm or correct the transcribed figures above. They are source estimates, not values calculated from ingredient quantities.':'Brevity totals the full batch, then divides it by the batch yield.'}</span></div><button type="button" onClick={()=>{setImageNutrition(false);calculate()}} disabled={saving||nutritionState==='loading'||!ingredientLines().length||!Number(form.yieldQuantity)||!form.yieldUnit.trim()}>{nutritionState==='loading'?'Calculating…':imageNutrition?'Calculate from measured ingredients':nutrition?'Recalculate nutrition':'Calculate nutrition'}</button></div>
        {nutritionError&&<div className="meal-nutrition-error meal-add-form--wide" role="alert">{nutritionError}</div>}
        {nutrition&&<section className="meal-nutrition-preview meal-add-form--wide" aria-label="Calculated nutrition preview">
          <header><div><span>Calculated estimate</span><strong>Total batch and per {nutrition.serving}</strong></div></header>
          <div className="meal-nutrition-totals"><article><span>Total batch</span><Macros meal={{serving:'batch',macros:nutrition.batchMacros,nutritionBasis:nutrition.nutritionBasis}} /></article><article><span>Per {nutrition.serving}</span><Macros meal={{serving:nutrition.serving,macros:nutrition.perServingMacros,nutritionBasis:nutrition.nutritionBasis}} /></article></div>
          {nutrition.ingredients.length>0&&<details><summary>Ingredient calculation details</summary>{nutrition.ingredients.map((ingredient,index)=><div className="meal-nutrition-row" key={`${ingredient.input}-${index}`}><div><strong>{ingredient.input}</strong><small>{ingredient.resolvedName} · {ingredient.basis} · {ingredient.confidence} confidence</small></div><span>{ingredient.macros.calories} cal · {ingredient.macros.proteinGrams}g P · {ingredient.macros.carbohydrateGrams}g C · {ingredient.macros.fatGrams}g F</span></div>)}</details>}
          {nutrition.warnings.length>0&&<ul>{nutrition.warnings.map((warning,index)=><li key={`${warning}-${index}`}>{warning}</li>)}</ul>}
          <small>{nutrition.nutritionBasis}</small>
        </section>}
        <div className="meal-image-generation-note meal-add-form--wide"><i className="ti ti-photo-spark" /><div><strong>Meal image generated by Brevity</strong><span>When you save, Brevity creates an ultra-photorealistic editorial food image styled to match the Meal Library.</span></div></div>
        {error&&<div className="meal-nutrition-error meal-add-form--wide" role="alert">{error}</div>}
        <footer><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="is-primary" disabled={saving||!nutrition||!form.name.trim()||!ingredientLines().length||form.prepMinutes===''||form.cookMinutes===''||!Number(form.yieldQuantity)||!form.yieldUnit.trim()}>{saving?'Adding meal…':'Add to Meal Library'}</button></footer>
      </form>}
    </section>
  </div>
}


function LibraryView({library,onAdd,onOpenMeal,onBulkImport,onCsvImport,selecting=false,busy=false}) {
 const [query,setQuery]=useState(''),[category,setCategory]=useState('all'),[favorites,setFavorites]=useState(false),[season,setSeason]=useState('all')
 const meals=useMemo(()=>searchMeals(library,query).filter(meal=>(category==='all'||libraryCategory(meal)===category)&&(!favorites||meal.favorite)&&(season==='all'||(season==='seasonal'?(meal.seasons||[]).length:season==='year-round'?!(meal.seasons||[]).length:(meal.seasons||[]).includes(season)))).sort((a,b)=>a.name.localeCompare(b.name)),[library,query,category,favorites,season])
 return <div className="meal-library"><div className="meal-library-search"><label htmlFor="meal-library-query">Search Meal Library</label><div><input id="meal-library-query" type="search" autoFocus={selecting} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search meals, sides or ingredients"/></div><div className="meal-library-filters" role="group" aria-label="Filter library categories">{[['all','All items'],...LIBRARY_CATEGORIES.map(type=>[type,LIBRARY_CATEGORY_LABELS[type]])].map(([type,label])=><button key={type} aria-pressed={category===type} onClick={()=>setCategory(type)}>{label}</button>)}</div><div className="meal-library-filters"><button aria-pressed={favorites} onClick={()=>setFavorites(value=>!value)}>★ Favorites</button><label>Season<select aria-label="Filter by season" value={season} onChange={event=>setSeason(event.target.value)}>{[['all','All seasons'],['seasonal','Seasonal only'],['year-round','Year-round'],...MEAL_SEASONS.map(value=>[value,value])].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div><span role="status">{meals.length} items available</span>{onAdd&&<div>{[['meal','Add meal'],['side','Add side'],['ingredient','Add food / ingredient']].map(([type,label])=><button className="meal-library-add" key={type} onClick={()=>onAdd(type)}>{label}</button>)}</div>}{onBulkImport&&<button onClick={onBulkImport}>Bulk import from images</button>}{onCsvImport&&<button onClick={onCsvImport}>Import Plan to Eat CSV</button>}</div>
 {!meals.length&&<p>No meals match. Try another search or category.</p>}
 <div className="meal-library-grid">{meals.map(meal=>{const disabled=busy||selecting&&!mealReadyForPlanning(meal);return <article className="meal-card-action" key={meal.id} role="button" tabIndex={disabled?-1:0} aria-disabled={disabled||undefined} aria-label={selecting?`Swap to ${meal.name}`:`View ${meal.name} details`} onClick={()=>{if(!disabled)onOpenMeal(meal)}} onKeyDown={event=>{if(!disabled&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onOpenMeal(meal)}}}><MealImage meal={meal} alt={meal.name}/><div className="meal-library-copy"><div><strong>{meal.name}</strong><span>{mealTimingLabel(meal)}</span></div><span className="meal-category-label">{libraryCategoryLabel(meal)}{meal.favorite?' · ★ Favorite':''}{meal.seasons?.length?` · ${meal.seasons.join(', ')}`:''}</span><p>{meal.description}</p><Macros meal={meal}/>{!mealReadyForPlanning(meal)&&<p>Needs recipe or nutrition review before planning. Open from Meal Library to edit.</p>}{selecting&&containsSeafood(meal)&&<p>Contains seafood — select only deliberately.</p>}<small className="meal-library-view">{selecting?'Swap to this meal':'View ingredients & recipe'}</small></div></article>})}</div></div>
}

export default function MealPlanner({currentMember,canEditPlanning=true,onOpenGroceryList}) {
  const { data, state, error, reload, addMeal } = useRollingMealPlan({reloadOnRefreshEvents:true})
  const [view, setView] = useState('plan')
  const [selectedMonth, setSelectedMonth] = useState(() => getHouseholdDateKey().slice(0, 7))
  const monthRange = useMemo(() => mealMonthRange(selectedMonth), [selectedMonth])
  const monthPlan = useRollingMealPlan({enabled:view === 'month', ...monthRange, reloadOnRefreshEvents:true})
  const [csvImportOpen,setCsvImportOpen]=useState(false)
  const [swapSelection,setSwapSelection]=useState(null)
  const [scheduledSelection,setScheduledSelection]=useState(null),[calendarBusy,setCalendarBusy]=useState(false)
  const reviewCalendar=async raw=>{setCalendarBusy(true);setReplacementError('');try{const command=normalizeMealScheduleCommand(raw);const description=command.kind==='set'?`Customize ${command.slot} on ${command.date} for ${command.servings} people${command.recipe?`: ${command.recipe.name}; per person: ${command.recipe.ingredients.join('; ')}`:''}`:command.kind==='move'?`Swap ${command.slot} on ${command.date} with ${command.toSlot} on ${command.toDate}`:command.kind==='generate'?`Replace ${command.count} days starting ${command.date} with household-safe automatic meals for six people. Existing custom menus in this range will be replaced.`:command.kind==='shift-week'?`Move seven days starting ${command.date} by ${command.offset} days. Destination menus are replaced and vacated dates are left empty.`:`${command.kind==='swap-day'?'Swap menus between':'Move the full menu from'} ${command.date} and ${command.toDate}.${command.kind==='move-day'?' The destination menu is replaced and the source day is left empty.':''}`;const result=await prepareDirectAction({summary:description,expectedVersion:visiblePlan.data.scheduleVersion??0,operation:{type:'meal.schedule.update',targetId:'household-meal-calendar',targetDate:command.date,description,payload:{commandJson:JSON.stringify(command)}}});if(!requestActionReview(result.proposal))throw Error('Could not open Action Mode.');return result}catch(cause){setReplacementError(cause.message);throw cause}finally{setCalendarBusy(false)}}
  const [addingMealType, setAddingMealType] = useState('')
  const [bulkImportOpen,setBulkImportOpen] = useState(false)
  const [detailMeal, setDetailMeal] = useState(null)
  const [editingMeal,setEditingMeal]=useState(null)
  const [message, setMessage] = useState('')
  const [replacementError, setReplacementError] = useState('')
  const [addMealError, setAddMealError] = useState('')
  const planInsight = useMemo(() => summarizeMealPlan(data?.days), [data])
  const visiblePlan = view === 'month' ? monthPlan : {data,state,error,reload}
  const imageGenerated=async meal=>{
    setDetailMeal(meal)
    setMessage(`${meal.name} now has a newly generated luxury steakhouse image.`)
    await reload({supersede:true}).catch(()=>undefined)
  }

  useEffect(()=>{const ready=event=>setDetailMeal(current=>current?.id===event.detail?.meal?.id?{...current,image:event.detail.meal.image}:current);window.addEventListener('brevity-meal-image-ready',ready);return()=>window.removeEventListener('brevity-meal-image-ready',ready)},[])

  const updatePreferences=async (meal,patch)=>{
    const result=await saveMealPreferences(meal.id,patch)
    setDetailMeal(current=>current?.id===meal.id?{...current,...result.meal}:current)
    await reload({supersede:true})
  }

  const saveMeal = async meal => {
    setMessage('')
    setAddMealError('')
    try {
      const created = await addMeal(meal)
      setAddingMealType('')
      setMessage(`${created.name} was added to the household Meal Library. Brevity is generating its image in the background.`)
      ensureMealImage(created).then(async result=>{
        await reload({supersede:true}).catch(()=>undefined)
        setMessage(`${result.meal.name} was added to the household Meal Library with its generated image.`)
      }).catch(imageError=>{
        setMessage(`${created.name} was added to the household Meal Library, but its image could not be generated. Open the meal to try again. ${imageError.message||''}`.trim())
      })
    } catch (addError) {
      if(addError.code==='STALE_MEAL_SCOPE')return
      setAddMealError(addError.message || 'Could not add this meal to the household library.')
    }
  }

  return <main className="meal-planner">
    <header className="meal-planner-hero"><div><p>Health &amp; Nutrition</p><h1>{view === 'month' ? 'Monthly Meal Plan' : 'Rolling 7-Day Meal Plan'}</h1><span>Household meals for six, with portions and ingredients you can customize by date.</span></div><div className="meal-plan-stat"><strong>{data?.librarySummary?.total ?? 117}</strong><span>household meals</span></div></header>
    <div className="meal-planner-controls"><nav aria-label="Meal planner views"><button type="button" className={view === 'plan' ? 'is-active' : ''} onClick={() => setView('plan')}><i className="ti ti-calendar-week" /> 7-Day Plan</button><button type="button" className={view === 'month' ? 'is-active' : ''} onClick={() => setView('month')}><i className="ti ti-calendar-month" /> Month Plan</button><button type="button" className={view === 'library' ? 'is-active' : ''} onClick={() => setView('library')}><i className="ti ti-tools-kitchen-2" /> Meal Library</button><button type="button" className={view==='groceries'?'is-active':''} onClick={()=>setView('groceries')}>Weekly groceries</button><button type="button" className={view === 'consumed' ? 'is-active' : ''} onClick={() => setView('consumed')}>Consumed</button></nav><p><i className="ti ti-refresh" /> The seven-day window rolls forward daily; replacements remain attached to their date.</p></div>
    {view === 'consumed' && <ConsumedNutrition currentMember={currentMember} />}
    {view === 'month' && <div className="meal-month-controls"><label htmlFor="meal-month-selector">Select month</label><input id="meal-month-selector" type="month" value={selectedMonth} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) setSelectedMonth(event.target.value) }} /><span>{new Date(`${monthRange.startDate}T12:00:00`).toLocaleDateString('en-US',{month:'long',year:'numeric'})} · {monthRange.count} days</span></div>}
    {view==='groceries'&&<WeeklyGroceries canEdit={canEditPlanning} onOpenList={onOpenGroceryList}/>}
    {message && <div className="meal-planner-message" role="status">{message}</div>}
    {data && view === 'plan' && planInsight && <section className="meal-plan-insight" aria-label="Meal plan insight"><div><span>Today’s plan insight</span><strong>{planInsight.mealCount} meals are planned for {formatDay(planInsight.selectedDate)}.</strong><p>The totals below aggregate breakfast, lunch, dinner, and two snacks for this day. Preparation uses each meal’s total time, or prep time when no separate cook time exists.</p></div><dl><div><dt>Total planned time</dt><dd>{formatPrepMinutes(planInsight.totalPrepMinutes)}</dd></div><div><dt>Total calories</dt><dd>{planInsight.totalCalories.toLocaleString()} cal</dd></div><div><dt>Total protein</dt><dd>{planInsight.totalProteinGrams}g</dd></div><div><dt>Total carbs</dt><dd>{planInsight.totalCarbohydrateGrams}g</dd></div><div><dt>Total fat</dt><dd>{planInsight.totalFatGrams}g</dd></div><div><dt>Longest preparation</dt><dd>{planInsight.longestPrep.name} · {planInsight.longestPrep.prepMinutes} min</dd></div></dl><small>These are estimates for the meals and snacks shown for this day, not evidence that a meal was prepared or eaten.</small></section>}
    {view !== 'month' && view !== 'groceries' && state === 'loading' && !data && <div className="meal-planner-state"><i className="ti ti-loader-2" /> Preparing the household meal plan…</div>}
    {view !== 'month' && view !== 'groceries' && error && <div className="meal-planner-state meal-planner-state--error"><strong>Meal plan needs attention</strong><span>{error}</span><button type="button" onClick={() => reload().catch(() => undefined)}>Retry</button></div>}
    {view === 'month' && monthPlan.state === 'loading' && <div className="meal-planner-state" role="status">Loading the selected month…</div>}
    {view === 'month' && monthPlan.error && <div className="meal-planner-state meal-planner-state--error" role="alert"><strong>Month plan needs attention</strong><span>{monthPlan.error}</span><button type="button" onClick={() => monthPlan.reload().catch(() => undefined)}>Retry</button></div>}
    {view === 'month' && monthPlan.data && <p className="meal-month-summary">{monthPlan.data.days.length} days · {monthPlan.data.days.reduce((sum,day)=>sum+Object.values(day.resolvedMeals||{}).filter(Boolean).length,0)} planned meals</p>}
    {view === 'library' && data && <LibraryView library={data.library} onAdd={setAddingMealType} onOpenMeal={setDetailMeal} onCsvImport={()=>setCsvImportOpen(true)} onBulkImport={()=>setBulkImportOpen(true)} />}
    {replacementError&&<p className="meal-dialog-error" role="alert">{replacementError}</p>}
    {(view==='plan'||view==='month')&&visiblePlan.data&&<MealCalendar key={`${view}-${visiblePlan.data.startDate}`} days={visiblePlan.data.days} monthly={view==='month'} canEdit={canEditPlanning} onOpenMeal={setDetailMeal} busy={calendarBusy} onSwap={selection=>{setReplacementError('');setSwapSelection(selection)}} onEdit={({day,slot})=>setScheduledSelection({day,slot})} onReview={command=>reviewCalendar(command).catch(()=>undefined)}/>}
    {csvImportOpen&&<RecipeCsvImport library={data?.library||[]} onClose={()=>setCsvImportOpen(false)} onSaved={async result=>{setMessage(`Imported ${result.added} recipes; ${result.skipped.length} duplicates skipped. ${result.needsReview} need recipe or nutrition review.`);await reload()}}/>}
    {swapSelection&&<div className="meal-dialog-backdrop"><section className="meal-dialog meal-swap-dialog" role="dialog" aria-modal="true" aria-labelledby="meal-swap-title" onKeyDown={event=>{if(event.key==='Escape'&&!calendarBusy){event.stopPropagation();setSwapSelection(null)}}}><header><div><h2 id="meal-swap-title">Swap meal</h2><p>{formatDay(swapSelection.day.date)} · {LABELS[swapSelection.slot]} · {swapSelection.day.servings?.[swapSelection.slot]??6} people</p><p>Choose any meal from the library to replace this date’s meal. Your change will be reviewed before saving.</p></div><button type="button" disabled={calendarBusy} onClick={()=>setSwapSelection(null)} aria-label="Close meal swap">×</button></header><div className="meal-swap-library">{replacementError&&<p role="alert">{replacementError}</p>}<LibraryView library={visiblePlan.data?.library||data?.library||[]} selecting busy={calendarBusy} onOpenMeal={async meal=>{try{await reviewCalendar({kind:'set',date:swapSelection.day.date,slot:swapSelection.slot,servings:swapSelection.day.servings?.[swapSelection.slot]??6,mealId:meal.id});setSwapSelection(null)}catch{ /* Keep the library open for retry. */ }}}/></div></section></div>}
    {scheduledSelection&&<ScheduledMealEditor selection={scheduledSelection} library={visiblePlan.data?.library||data?.library||[]} onClose={()=>setScheduledSelection(null)} busy={calendarBusy} onReview={reviewCalendar}/>}
    {detailMeal && <MealDetailDialog meal={detailMeal} onPreferences={(data?.library||[]).some(meal=>meal.id===detailMeal.id)?updatePreferences:undefined} onSwap={canEditPlanning&&detailMeal._plannedSelection?()=>{setReplacementError('');setSwapSelection(detailMeal._plannedSelection);setDetailMeal(null)}:undefined} onClose={()=>setDetailMeal(null)} onImageGenerated={imageGenerated} onEdit={()=>{if(detailMeal._plannedSelection){setScheduledSelection(detailMeal._plannedSelection);setDetailMeal(null);return}setEditingMeal({meal:(data?.library||[]).find(item=>item.id===detailMeal.id)||detailMeal,version:data?.libraryVersion});setDetailMeal(null)}} />}
    {addingMealType && <AddMealDialog mealType={addingMealType} saving={state === 'saving'} error={addMealError} onClose={()=>{setAddMealError('');setAddingMealType('')}} onSave={saveMeal} />}
    {editingMeal&&<MealEditDialog meal={editingMeal.meal} version={editingMeal.version} onClose={()=>setEditingMeal(null)}/>}
    {bulkImportOpen && <BulkMealImport library={data?.library || []} onClose={()=>setBulkImportOpen(false)} onSaved={async meals=>{const refreshed=await reload({supersede:true}).then(()=>true).catch(()=>false);setBulkImportOpen(false);setMessage(`${meals.length} meals added to the household Meal Library. ${refreshed?'Missing meal photos are generated automatically.':'Refresh Brevity to see them; the library update succeeded.'}`)}} />}
  </main>
}
