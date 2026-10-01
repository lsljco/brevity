export const macroFields = ['calories','proteinGrams','carbohydrateGrams','fatGrams']
export function normalizeRecipeEdit(value) {
  const allowed=['description','serving','yieldQuantity','yieldUnit','ingredients','instructions','prepMinutes','cookMinutes','macros']
  if(!value||typeof value!=='object'||Object.keys(value).some(key=>!allowed.includes(key)))throw new Error('The recipe edit contains an unsupported field.')
  const result={}
  for(const key of ['description','serving','yieldUnit']){
    if(typeof value[key]!=='string'||value[key].length>2000)throw new Error(`Enter a valid ${key}.`)
    result[key]=value[key].trim()
  }
  if(!result.serving||!result.yieldUnit)throw new Error('Enter a serving size and yield unit.')
  for(const key of ['yieldQuantity','prepMinutes','cookMinutes']){
    if(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<0||value[key]>10000||(key==='yieldQuantity'&&value[key]===0))throw new Error(`Enter a valid ${key}.`)
    result[key]=value[key]
  }
  for(const key of ['ingredients','instructions']){
    if(!Array.isArray(value[key])||value[key].length>100||value[key].some(line=>typeof line!=='string'||line.length>2000))throw new Error(`Enter valid ${key}.`)
    result[key]=value[key].map(line=>line.trim()).filter(Boolean)
  }
  if(!value.macros||Object.keys(value.macros).some(key=>!macroFields.includes(key))||macroFields.some(key=>typeof value.macros[key]!=='number'||!Number.isFinite(value.macros[key])||value.macros[key]<0||value.macros[key]>100000))throw new Error('Enter all four non-negative per-serving macros.')
  result.macros=Object.fromEntries(macroFields.map(key=>[key,value.macros[key]]))
  return result
}
export function resizeRecipeServing(recipe, multiplier) {
  if(!Number.isFinite(multiplier)||multiplier<=0||multiplier>100)throw new Error('Choose a serving multiplier greater than zero and no more than 100.')
  return {...recipe,serving:`${multiplier} × (${recipe.serving})`,yieldQuantity:recipe.yieldQuantity/multiplier,macros:Object.fromEntries(macroFields.map(key=>[key,Math.round(recipe.macros[key]*multiplier*100)/100]))}
}
