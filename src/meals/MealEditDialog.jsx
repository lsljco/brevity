import {useState} from 'react'
import {prepareDirectAction} from '../assistant/assistantApi.js'
import {requestActionReview} from '../assistant/actionEvents.js'
import {calculateMealNutrition} from './mealPlanApi.js'
import {macroFields,normalizeRecipeEdit,resizeRecipeServing} from './recipeEdit.js'
const labels={calories:'Calories',proteinGrams:'Protein (g)',carbohydrateGrams:'Carbs (g)',fatGrams:'Fat (g)'}
export default function MealEditDialog({meal,version,onClose}) {
  const [name,setName]=useState(meal.name)
  const [draft,setDraft]=useState(()=>({description:meal.description||'',serving:meal.serving||'1 serving',yieldQuantity:meal.yieldQuantity||1,yieldUnit:meal.yieldUnit||'servings',ingredients:meal.ingredients||[],instructions:meal.instructions||[],prepMinutes:meal.prepMinutes||0,cookMinutes:meal.cookMinutes||0,macros:meal.macros}))
  const [dirty,setDirty]=useState(false),[checked,setChecked]=useState(false),[factor,setFactor]=useState(1),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notes,setNotes]=useState([])
  const change=(key,value)=>{setDraft(current=>({...current,[key]:value}));if(['ingredients','serving','yieldQuantity','yieldUnit','macros'].includes(key)){setDirty(true);setChecked(false)}}
  const calculate=async()=>{
    setBusy('calculate');setError('')
    try{
      const {nutrition:result}=await calculateMealNutrition(draft.ingredients,Number(draft.yieldQuantity),draft.yieldUnit)
      if(result.clarifications?.length)throw new Error(result.clarifications.map(item=>typeof item==='string'?item:item.question||item.message).filter(Boolean).join(' ')||'Clarify ingredient amounts before calculating.')
      if(!result.perServingMacros)throw new Error('Nutrition could not be calculated. Enter and verify the macros instead.')
      setDraft(current=>({...current,serving:result.serving||current.serving,macros:result.perServingMacros}));setNotes(result.warnings||[]);setDirty(false);setChecked(false)
    }catch(cause){setError(cause.message)}finally{setBusy('')}
  }
  const resize=()=>{try{setDraft(resizeRecipeServing({...draft,yieldQuantity:Number(draft.yieldQuantity)},Number(factor)));setFactor(1);setError('')}catch(cause){setError(cause.message)}}
  const review=async event=>{
    event.preventDefault();setBusy('review');setError('')
    try{
      if(dirty&&!checked)throw new Error('Recalculate nutrition or confirm the per-serving macros before review.')
      if(!Number.isInteger(version))throw new Error('Reload the meal library before editing this recipe.')
      const edit=normalizeRecipeEdit({...draft,yieldQuantity:Number(draft.yieldQuantity),prepMinutes:Number(draft.prepMinutes),cookMinutes:Number(draft.cookMinutes),macros:Object.fromEntries(macroFields.map(key=>[key,Number(draft.macros[key])]))})
      const result=await prepareDirectAction({summary:`Edit ${meal.name}`,expectedVersion:version,operation:{type:'meal.recipe.update',targetId:meal.id,payload:{name:name.trim(),recipeJson:JSON.stringify(edit)},description:`Update ${meal.name} to ${name.trim()}. Serving: ${edit.serving}; ${edit.yieldQuantity} ${edit.yieldUnit} per batch. Per serving: ${edit.macros.calories} calories, ${edit.macros.proteinGrams}g protein, ${edit.macros.carbohydrateGrams}g carbs, ${edit.macros.fatGrams}g fat.`}})
      if(!result?.proposal?.id)throw new Error('The recipe review could not be prepared.')
      onClose();requestActionReview(result.proposal)
    }catch(cause){setError(cause.message)}finally{setBusy('')}
  }
  return <div className="meal-dialog-backdrop"><section className="meal-dialog" role="dialog" aria-modal="true" aria-labelledby="meal-edit-title"><header><div><span>Shared recipe</span><h2 id="meal-edit-title">Edit meal</h2><p>Changes update this recipe everywhere it is planned. Previously logged meals stay unchanged.</p></div><button type="button" onClick={onClose} disabled={Boolean(busy)} aria-label="Close meal editor">×</button></header><form onSubmit={review}><fieldset className="meal-edit-fields" disabled={Boolean(busy)}>
    <label>Meal title<input required maxLength="200" value={name} onChange={event=>setName(event.target.value)}/></label>
    <label>Description<textarea value={draft.description} onChange={event=>change('description',event.target.value)}/></label>
    <label>Serving size<input required value={draft.serving} onChange={event=>change('serving',event.target.value)}/></label>
    <label>Servings per batch<input required type="number" min="0.001" step="any" value={draft.yieldQuantity} onChange={event=>change('yieldQuantity',event.target.value)}/></label>
    <label>Yield unit<input required value={draft.yieldUnit} onChange={event=>change('yieldUnit',event.target.value)}/></label>
    <p>Ingredient quantities below describe the whole batch. Macros describe one serving.</p>
    <label>Ingredients (one per line)<textarea rows="5" value={draft.ingredients.join('\n')} onChange={event=>change('ingredients',event.target.value.split('\n'))}/></label>
    <label>Instructions (one step per line)<textarea rows="5" value={draft.instructions.join('\n')} onChange={event=>change('instructions',event.target.value.split('\n'))}/></label>
    {['prepMinutes','cookMinutes'].map(key=><label key={key}>{key==='prepMinutes'?'Prep minutes':'Cook minutes'}<input required type="number" min="0" step="any" value={draft[key]} onChange={event=>change(key,event.target.value)}/></label>)}
    <h3>Nutrition per serving</h3>{macroFields.map(key=><label key={key}>{labels[key]}<input required type="number" min="0" step="any" value={draft.macros[key]??''} onChange={event=>change('macros',{...draft.macros,[key]:event.target.value})}/></label>)}
    <button type="button" onClick={calculate} disabled={!draft.ingredients.filter(Boolean).length}>{busy==='calculate'?'Calculating…':'Recalculate from ingredients'}</button>
    <label>Serving multiplier<input type="number" min="0.01" max="100" step="any" value={factor} onChange={event=>setFactor(event.target.value)}/></label><button type="button" disabled={dirty&&!checked} onClick={resize}>Resize serving and macros</button><p>For example, 1.5 makes each serving 50% larger and scales its macros. The batch ingredients stay the same.</p>
    {dirty&&<label><input type="checkbox" checked={checked} onChange={event=>setChecked(event.target.checked)}/> I verified these macros for the serving size and ingredients.</label>}
    {notes.map((note,index)=><p key={index}>{String(note)}</p>)}
    </fieldset>{error&&<p role="alert" className="meal-nutrition-error">{error}</p>}<footer><button type="button" onClick={onClose} disabled={Boolean(busy)}>Cancel</button><button type="submit" disabled={Boolean(busy)||(dirty&&!checked)}>{busy==='review'?'Preparing review…':'Review meal changes'}</button></footer></form></section></div>
}
