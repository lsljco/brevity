import { useState } from 'react'
import { createMealLibraryBatch, importMealsFromImage } from './mealPlanApi.js'
import './BulkMealImport.css'

const fields = [['calories','Calories'],['proteinGrams','Protein (g)'],['carbohydrateGrams','Carbs (g)'],['fatGrams','Fat (g)']]
const mealKey = meal => `${meal.mealType}:${String(meal.name || '').trim().toLowerCase()}`
const validMacros = meal => fields.every(([key]) => meal.macros[key] !== '' && meal.macros[key] != null && Number.isFinite(Number(meal.macros[key])) && Number(meal.macros[key]) >= 0)

export default function BulkMealImport({ library, onClose, onSaved }) {
  const [drafts,setDrafts] = useState([])
  const [state,setState] = useState('idle')
  const [progress,setProgress] = useState('')
  const [error,setError] = useState('')
  const [warnings,setWarnings] = useState([])
  const [selected,setSelected] = useState({})
  const update = (id, change) => setDrafts(current => current.map(meal => meal.id === id ? { ...meal, ...change } : meal))
  const importFiles = async event => {
    const files = [...(event.target.files || [])]; event.target.value = ''
    if (!files.length) return
    if (files.length > 10) { setError('Choose up to 10 images at a time.'); return }
    setState('reading'); setError(''); setWarnings([])
    const found = [], issues = []
    for (const [index,file] of files.entries()) {
      setProgress(`Reading image ${index + 1} of ${files.length}: ${file.name}`)
      try {
        const result = await importMealsFromImage(file)
        found.push(...(result.meals || []).map((meal,position) => ({ ...meal, id:`${Date.now()}-${index}-${position}`, source:file.name, ingredients:(meal.ingredients || []).join('\n'), mealType:meal.mealType || 'lunch', macros:meal.macros || {}, warnings:meal.warnings || [] })))
        issues.push(...(result.warnings || []).map(warning => `${file.name}: ${warning}`))
      } catch (cause) { issues.push(`${file.name}: ${cause.message || 'Image could not be read.'}`) }
    }
    const known = new Set([...library,...drafts].map(mealKey))
    const incoming = {}
    for (const meal of found) { incoming[meal.id] = !known.has(mealKey(meal)) && validMacros(meal) && Boolean(meal.ingredients.trim()); known.add(mealKey(meal)) }
    setDrafts(current => [...current,...found]); setSelected(current => ({ ...current,...incoming }))
    setWarnings(issues); setState('ready'); setProgress('')
    if (!found.length) setError('No meal drafts were found. Try a clearer image or smaller sections of the sheet.')
  }
  const existing = new Set(library.map(mealKey))
  const counts = new Map()
  drafts.filter(meal => selected[meal.id]).forEach(meal => counts.set(mealKey(meal),(counts.get(mealKey(meal)) || 0) + 1))
  const chosen = drafts.filter(meal => selected[meal.id])
  const invalid = chosen.filter(meal => !meal.name.trim() || !meal.ingredients.trim() || !validMacros(meal) || existing.has(mealKey(meal)) || counts.get(mealKey(meal)) > 1)
  const save = async () => {
    if (!chosen.length || invalid.length) return
    setState('saving'); setError('')
    try {
      const meals = chosen.map(meal => ({ mealType:meal.mealType, name:meal.name.trim(), description:meal.name.trim(), ingredients:meal.ingredients.split(/\r?\n/).map(value => value.trim()).filter(Boolean), prepMinutes:0, cookMinutes:0, timingRecorded:false, serving:meal.serving || '1 plate', yieldQuantity:1, yieldUnit:'plate', macros:Object.fromEntries(fields.map(([key]) => [key,Number(meal.macros[key])])), nutritionBasis:'Macros transcribed from an uploaded meal graphic; confirm portions and nutrition against the source.', nutritionWarnings:meal.warnings, sourceName:`Uploaded meal graphic: ${meal.source}` }))
      const result = await createMealLibraryBatch(meals)
      await onSaved(result.meals)
    } catch (cause) { setError(cause.message || 'Could not save the meal batch.'); setState('ready') }
  }
  return <div className="meal-dialog-backdrop"><section className="meal-dialog meal-bulk-dialog" role="dialog" aria-modal="true" aria-labelledby="meal-bulk-title">
    <header><div><span>Household Meal Library</span><h2 id="meal-bulk-title">Bulk import meals</h2><p>Upload several menu images, review every plate and its printed macros, then add the selected meals together.</p></div><button type="button" onClick={onClose} disabled={state === 'saving'} aria-label="Close bulk import"><i className="ti ti-x" /></button></header>
    <div className="meal-bulk-body"><label className="meal-bulk-upload"><span>Choose up to 10 meal images</span><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={importFiles} disabled={state === 'reading' || state === 'saving'} /></label>
      {progress && <p role="status">{progress}</p>}
      {warnings.length > 0 && <details><summary>{warnings.length} image note{warnings.length === 1 ? '' : 's'}</summary><ul>{warnings.map((warning,index) => <li key={index}>{warning}</li>)}</ul></details>}
      {error && <p className="meal-nutrition-error" role="alert">{error}</p>}
      {drafts.length > 0 && <><p role="status">{drafts.length} drafts found · {chosen.length} selected · {invalid.length} selected need review. Existing names and repeated plates are left unselected.</p><div className="meal-bulk-list">{drafts.map((meal,index) => { const duplicate = existing.has(mealKey(meal)) || drafts.findIndex(candidate => mealKey(candidate) === mealKey(meal)) !== index; const incomplete = !meal.name.trim() || !meal.ingredients.trim() || !validMacros(meal); return <fieldset className="meal-bulk-row" key={meal.id}><legend>Meal {index + 1} · {meal.source}</legend><label className="meal-bulk-select"><input type="checkbox" checked={Boolean(selected[meal.id])} onChange={event => setSelected(current => ({ ...current,[meal.id]:event.target.checked }))} /> Add this meal</label><div className="meal-bulk-fields"><label>Meal type<select value={meal.mealType} onChange={event => update(meal.id,{mealType:event.target.value})}><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option></select></label><label>Meal name<input value={meal.name} onChange={event => update(meal.id,{name:event.target.value})} /></label><label>Serving<input value={meal.serving || ''} onChange={event => update(meal.id,{serving:event.target.value})} /></label></div><label>Ingredients, one per line<textarea value={meal.ingredients} onChange={event => update(meal.id,{ingredients:event.target.value})} /></label><div className="meal-bulk-macros">{fields.map(([key,label]) => <label key={key}>{label}<input type="number" min="0" step="1" value={meal.macros[key] ?? ''} onChange={event => update(meal.id,{macros:{...meal.macros,[key]:event.target.value}})} /></label>)}</div>{duplicate && <small className="meal-bulk-warning">Duplicate name for this meal type. Deselect or rename it.</small>}{incomplete && <small className="meal-bulk-warning">Name, ingredients and all four macros are required.</small>}{meal.warnings?.length > 0 && <ul>{meal.warnings.map((warning,i) => <li key={i}>{warning}</li>)}</ul>}</fieldset> })}</div></>}
      <p className="meal-bulk-note">Optional carb variants are noted for review. No preparation time or individual meal photo is inferred from these sheets; photos can be added from each meal later.</p></div>
    <footer><button type="button" onClick={onClose} disabled={state === 'saving'}>Cancel</button><button type="button" className="is-primary" onClick={save} disabled={state === 'reading' || state === 'saving' || !chosen.length || Boolean(invalid.length)}>{state === 'saving' ? 'Adding meals…' : `Add ${chosen.length} meal${chosen.length === 1 ? '' : 's'} to library`}</button></footer>
  </section></div>
}
