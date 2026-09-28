const macros=['calories','proteinGrams','carbohydrateGrams','fatGrams']
const optional=['fiberGrams','sugarGrams','sodiumMilligrams']
const fail=message=>{throw Object.assign(new Error(message),{code:'VALIDATION_ERROR',status:400})}
const round=value=>Number(value.toFixed(1))
const text=(value,max,label)=>{
  if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(`Enter ${label} (${max} characters or fewer).`)
  return value.trim()
}
const number=(value,label,{optional=false,positive=false,max=100000}={})=>{
  if(value==null||value===''){
    if(optional)return null
    fail(`Enter ${label}; use 0 only when the label says zero.`)
  }
  if(!['string','number'].includes(typeof value)||(typeof value==='string'&&!value.trim()))fail(`Enter a number for ${label}.`)
  const result=Number(value)
  if(!Number.isFinite(result)||result<0||(positive&&result===0)||result>max)fail(`Enter a valid ${label}${positive?' greater than zero':''}, no more than ${max}.`)
  return result
}

// Member-entered package data is preserved as provenance, never advertised as
// independently verified. Calculation is deterministic and makes no AI request.
export function calculateLabelNutrition(body={}){
  if(!Array.isArray(body.labels)||!body.labels.length||body.labels.length>30)fail('Enter labels for 1 to 30 foods, including every food in this meal.')
  const ingredients=body.labels.map((row,index)=>{
    if(!row||typeof row!=='object')fail(`Enter label details for food ${index+1}.`)
    const name=text(row.name,120,'the exact product name'),servingSize=text(row.servingSize,80,'the label serving size')
    const servings=number(row.servings,'servings eaten',{positive:true,max:500})
    const perLabelServing=Object.fromEntries([...macros,...optional].map(key=>[key,number(row[key],`${name}: ${key}`,{optional:optional.includes(key)})]))
    const input=`${servings} × ${servingSize} ${name}`
    return {input,resolvedName:name,amountDescription:input,basis:`Member-entered package label: per ${servingSize}; multiplied by ${servings}.`,source:'member-label',label:{servingSize,servings,perLabelServing},macros:Object.fromEntries(macros.map(key=>[key,round(perLabelServing[key]*servings)])),nutrients:Object.fromEntries(optional.map(key=>[key,perLabelServing[key]===null?null:round(perLabelServing[key]*servings)]))}
  })
  const batchMacros=Object.fromEntries(macros.map(key=>[key,round(ingredients.reduce((sum,item)=>sum+item.macros[key],0))]))
  const batchNutrients=Object.fromEntries(optional.map(key=>[key,ingredients.some(item=>item.nutrients[key]===null)?null:round(ingredients.reduce((sum,item)=>sum+item.nutrients[key],0))]))
  return {ingredients,yieldQuantity:1,yieldUnit:'meal',serving:'1 meal',batchMacros,perServingMacros:batchMacros,batchNutrients,perServingNutrients:batchNutrients,warnings:['Calculated from the package values you entered, not independently verified. Include all foods, sauces and cooking fats.'],nutritionBasis:'Member-entered package labels multiplied by servings eaten; totals calculated without AI estimation.'}
}
