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
