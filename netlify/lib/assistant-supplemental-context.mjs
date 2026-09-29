import {dailyNutrition} from './nutrition-ledger.mjs'
import {nutritionProgress,suggestPlannedMeals} from './nutrition-progress.mjs'

async function boundedRead(load,timeoutMs){
  let timer
  try{return await Promise.race([Promise.resolve().then(load),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Source timed out')),timeoutMs)})])}
  finally{clearTimeout(timer)}
}

// A failed source is not an empty record. Read-only sources can fail independently
// without blocking unrelated conversation, and unavailable data never becomes zero.
export async function loadAssistantSupplementalContext({canonical,member,resources,loadLibrary,loadCalendar,timeoutMs=6000}){
  const dates=Array.from({length:7},(_,offset)=>{const date=new Date(`${canonical.householdDate}T12:00:00Z`);date.setUTCDate(date.getUTCDate()-offset);return date.toISOString().slice(0,10)})
  const readers=[['recipe-library',loadLibrary],['apple-calendar',loadCalendar],['nutrition-targets',()=>resources.read(`nutrition-targets:${member}`)],...dates.map(date=>[`nutrition:${date}`,()=>resources.read(`nutrition:${member}:${date}`)])]
  const results=await Promise.allSettled(readers.map(([,read])=>boundedRead(read,timeoutMs)))
  const states=Object.fromEntries(readers.map(([id],index)=>[id,results[index].status==='fulfilled'&&results[index].value!=null?'available':'unavailable']))
  const value=id=>{const result=results[readers.findIndex(([key])=>key===id)];return result.status==='fulfilled'?result.value:null}
  const library=value('recipe-library'),targets=value('nutrition-targets')
  const recentNutrition=dates.filter(date=>states[`nutrition:${date}`]==='available').map(date=>dailyNutrition(value(`nutrition:${date}`).value,member,date))
  const daily=recentNutrition.find(day=>day.date===canonical.householdDate)||null
  const nutritionTargets=targets?Object.fromEntries(['calories','proteinGrams','carbohydrateGrams','fatGrams'].filter(key=>Number.isFinite(targets.value?.[key])).map(key=>[key,targets.value[key]])):null
  const progress=daily&&nutritionTargets?nutritionProgress(daily.totals,nutritionTargets):null
  return {mealLibrary:library?.library?.map(({image,...meal})=>meal)||[],recipeLibraryVersion:library?Number(library.entry?.data?.version||0):null,mealLibraryUnavailable:!library,dailyNutrition:daily,recentNutrition,nutritionUnavailable:!daily,nutritionTargets,nutritionProgress:progress,plannedMealOptions:progress?suggestPlannedMeals(progress,canonical.rollingMealPlan,canonical.householdDate):[],supplementalSources:states,unavailableNutritionDates:dates.filter(date=>states[`nutrition:${date}`]!=='available'),calendar:value('apple-calendar')}
}

export function assertActionSourcesAvailable(operation,context){
  const states=context.supplementalSources||{}
  const needed=operation.type.startsWith('nutrition.meal.')?`nutrition:${operation.targetDate}`:operation.type==='meal.recipe.update'?'recipe-library':operation.type.startsWith('calendar.')?'apple-calendar':null
  const canonicalSource=/^(plan\.|decision\.|assignment\.)/.test(operation.type)?'daily-plan':/^(improvement\.|project\.|transaction\.|budget\.|forecast\.|recurring\.)/.test(operation.type)?'shared-action-records':null
  if(needed&&states[needed]==='unavailable'||canonicalSource&&context.sources?.some(source=>source.id===canonicalSource&&source.state==='unavailable'))throw new Error('That saved record is temporarily unavailable. I can discuss the change, but need to reload it before preparing a safe review. Please ask me to retry.')
}
