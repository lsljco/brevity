import {useState} from 'react'
import {MEAL_SEASONS} from './mealPreferences.js'
export default function MealPreferences({meal,onSave}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState(null)
 const shown=pending?{...meal,...pending}:meal
 const save=async patch=>{setBusy(true);setError('');setPending(patch);try{await onSave(meal,patch)}catch(cause){setError(cause.message)}finally{setBusy(false);setPending(null)}}
 return <fieldset className="meal-preferences" disabled={busy}><legend>Library labels</legend>
 <button type="button" aria-pressed={Boolean(shown.favorite)} onClick={()=>save({favorite:!meal.favorite})}>{shown.favorite?'★ Favorited':'☆ Favorite'}</button>
 <div role="group" aria-label="Seasonal labels">{MEAL_SEASONS.map(season=><label key={season}><input type="checkbox" checked={(shown.seasons||[]).includes(season)} onChange={event=>save({seasons:event.target.checked?[...(meal.seasons||[]),season]:(meal.seasons||[]).filter(value=>value!==season)})}/>{season}</label>)}</div>
 <small>No seasons selected means year-round. Labels are shared by the household.</small>{busy&&<span role="status">Saving labels…</span>}{error&&<p role="alert">{error}</p>}
 </fieldset>
}
