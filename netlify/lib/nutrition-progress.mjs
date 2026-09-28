import { NUTRIENTS } from './nutrition-ledger.mjs'

const round=value=>Number(value.toFixed(1))

export function nutritionProgress(consumed={},targets={}) {
  const nutrients=Object.fromEntries(NUTRIENTS.map(key=>{
    const eaten=Number(consumed[key]||0)
    const target=Number(targets[key])
    return [key,Number.isFinite(target)&&target>0?{
      consumed:round(eaten),target:round(target),remaining:round(Math.max(0,target-eaten)),over:round(Math.max(0,eaten-target)),
    }:{consumed:round(eaten),target:null,remaining:null,over:null}]
  }))
  const protein=nutrients.proteinGrams,calories=nutrients.calories
  const guidance=[]
  if(protein.remaining>0){
    guidance.push(`Protein remaining: ${protein.remaining} g. Choose a protein-containing food and check its label or calculated serving before logging it.`)
  }
  if(calories.remaining===0&&calories.target!==null)guidance.push('Your calorie target has been reached; review portions and goals before choosing another meal.')
  else if(calories.remaining!==null)guidance.push(`${calories.remaining} calories remain against your saved target. Plan the next portion within that amount.`)
  if(nutrients.fatGrams.over>0||nutrients.carbohydrateGrams.over>0)guidance.push('One or more macro targets have been exceeded. Treat targets as planning guides and check the saved food entries for accuracy.')
  if(Object.values(nutrients).every(value=>value.target===null))guidance.push('Set your personal daily targets to see remaining amounts and tailored guidance.')
  return {nutrients,guidance,notice:'Suggestions use confirmed saved meals and your own targets. They are planning guidance, not a record of food eaten.'}
}

export function suggestPlannedMeals(progress,mealWindow,date) {
  const day=mealWindow?.days?.find(item=>item.date===date)
  if(!day)return []
  const remaining=progress?.nutrients||{}
  const options=Object.entries(day.meals||{}).flatMap(([mealType,meal])=>{
    const macros=meal?.macros
    if(!meal?.name||!macros||!['calories','proteinGrams','carbohydrateGrams','fatGrams'].every(key=>Number.isFinite(Number(macros[key]))&&Number(macros[key])>=0))return []
    const calories=Number(macros.calories),protein=Number(macros.proteinGrams)
    if(remaining.calories?.target!=null&&calories>remaining.calories.remaining)return []
    if(remaining.fatGrams?.target!=null&&Number(macros.fatGrams)>remaining.fatGrams.remaining)return []
    if(remaining.carbohydrateGrams?.target!=null&&Number(macros.carbohydrateGrams)>remaining.carbohydrateGrams.remaining)return []
    return [{mealType,name:meal.name,macros,notice:'Planned meal, not recorded as eaten. Values are estimates for the saved serving.'}]
  })
  return options.sort((left,right)=>{
    const gap=remaining.proteinGrams?.remaining
    if(gap==null)return left.macros.calories-right.macros.calories
    return Math.abs(gap-left.macros.proteinGrams)-Math.abs(gap-right.macros.proteinGrams)
  }).slice(0,3)
}

export function weeklyNutritionPilot(days=[]) {
  const confirmed=days.flatMap(day=>(day.entries||[]).map(entry=>({...entry,day:day.date})))
  const seen=new Map(),possibleDuplicates=[]
  for(const entry of confirmed){
    // Same foods, portions, totals, and date are a review signal, not proof of a duplicate.
    const foods=(entry.ingredients||[]).map(item=>String(item.input||'').trim().toLowerCase()).filter(Boolean)
    if(!foods.length)continue
    const key=JSON.stringify([entry.day,foods,entry.macros])
    if(seen.has(key))possibleDuplicates.push({date:entry.day,entryIds:[seen.get(key),entry.id]})
    else seen.set(key,entry.id)
  }
  return {
    daysWithMeals:days.filter(day=>(day.entries||[]).length>0).length,
    confirmedMeals:confirmed.length,
    correctedMeals:confirmed.filter(entry=>Boolean(entry.correctedAt)).length,
    possibleDuplicates,
    notice:'Matching saved foods and totals can represent separate meals. Review both entries before changing either one.',
  }
}
