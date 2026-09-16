const MODEL = process.env.OPENAI_NUTRITION_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini'

const macroFields = ['calories','proteinGrams','carbohydrateGrams','fatGrams']
const numeric = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}
const round = (value, places = 1) => Number(numeric(value).toFixed(places))

export const nutritionSchema = {
  type:'object',
  additionalProperties:false,
  required:['ingredients','warnings'],
  properties:{
    ingredients:{type:'array',minItems:1,maxItems:30,items:{
      type:'object',additionalProperties:false,
      required:['input','resolvedName','amountDescription','calories','proteinGrams','carbohydrateGrams','fatGrams','basis','confidence'],
      properties:{
        input:{type:'string'},resolvedName:{type:'string'},amountDescription:{type:'string'},
        calories:{type:'number',minimum:0},proteinGrams:{type:'number',minimum:0},
        carbohydrateGrams:{type:'number',minimum:0},fatGrams:{type:'number',minimum:0},
        basis:{type:'string'},confidence:{type:'string',enum:['high','medium','low']},
      },
    }},
    warnings:{type:'array',maxItems:20,items:{type:'string'}},
  },
}

export function normalizeNutritionRequest(body = {}) {
  const ingredients = (Array.isArray(body.ingredients) ? body.ingredients : String(body.ingredients || '').split(/\r?\n/))
    .map(value=>String(value||'').trim()).filter(Boolean)
  const yieldQuantity = Number(body.yieldQuantity)
  const yieldUnit = String(body.yieldUnit || '').trim().replace(/\s+/g,' ')
  const errors=[]
  if(!ingredients.length)errors.push('Enter at least one measured ingredient.')
  if(ingredients.length>30)errors.push('A meal can contain no more than 30 ingredient lines.')
  if(ingredients.some(value=>value.length>240))errors.push('Each ingredient must be 240 characters or fewer.')
  if(!Number.isFinite(yieldQuantity)||yieldQuantity<=0||yieldQuantity>500)errors.push('Batch yield must be greater than zero and no more than 500.')
  if(!yieldUnit||yieldUnit.length>40)errors.push('Name the yield unit, such as pancakes, servings or muffins.')
  if(errors.length)throw Object.assign(new Error(errors.join(' ')),{code:'VALIDATION_ERROR'})
  return {ingredients,yieldQuantity,yieldUnit}
}

const outputText = payload => payload?.output_text || (payload?.output || []).flatMap(item=>item?.content||[]).find(item=>item?.type==='output_text')?.text || ''

export function calculateNutritionResult(request, modelResult = {}) {
  const normalized=normalizeNutritionRequest(request)
  const rows=Array.isArray(modelResult.ingredients)?modelResult.ingredients:[]
  if(rows.length!==normalized.ingredients.length)throw new Error('Nutrition analysis did not return one result for every ingredient.')
  const ingredients=rows.map((row,index)=>({
    input:normalized.ingredients[index],
    resolvedName:String(row.resolvedName||normalized.ingredients[index]).trim(),
    amountDescription:String(row.amountDescription||normalized.ingredients[index]).trim(),
    basis:String(row.basis||'Standard nutrition reference estimate').trim(),
    confidence:['high','medium','low'].includes(row.confidence)?row.confidence:'low',
    macros:Object.fromEntries(macroFields.map(field=>[field,round(row[field])])),
  }))
  const batchMacros=Object.fromEntries(macroFields.map(field=>[field,round(ingredients.reduce((sum,row)=>sum+row.macros[field],0))]))
  const perServingMacros=Object.fromEntries(macroFields.map(field=>[field,round(batchMacros[field]/normalized.yieldQuantity)]))
  const unit=normalized.yieldQuantity===1?normalized.yieldUnit:normalized.yieldUnit.replace(/s$/i,'')
  return {
    ...normalized,
    serving:`1 ${unit}`,
    ingredients,
    batchMacros,
    perServingMacros,
    warnings:(Array.isArray(modelResult.warnings)?modelResult.warnings:[]).map(value=>String(value||'').trim()).filter(Boolean),
    nutritionBasis:'Calculated by Brevity from the measured ingredient list; branded products and preparation can vary, so compare uncertain items with the package label.',
  }
}

export async function calculateMealNutrition(body, {fetcher=globalThis.fetch, timeoutMs=40000} = {}) {
  const request=normalizeNutritionRequest(body)
  if(!process.env.OPENAI_API_KEY)throw Object.assign(new Error('Brevity nutrition calculation is not configured.'),{status:503})
  const controller=new AbortController()
  const timeout=setTimeout(()=>controller.abort(),timeoutMs)
  let response
  try{
    response=await fetcher('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},
      signal:controller.signal,
      body:JSON.stringify({
        model:MODEL,store:false,
        instructions:'Act as a careful recipe nutrition calculator. For each ingredient line, estimate nutrition for the entire stated amount—not one serving. Honor brand and product names when supplied and explain the label or standard-food basis briefly. Water contributes zero macros. Never omit an ingredient, never invent an extra ingredient, and mark ambiguity or uncertain brand variants in warnings. Values are estimates, not medical advice.',
        input:JSON.stringify(request),
        text:{format:{type:'json_schema',name:'brevity_meal_nutrition',strict:true,schema:nutritionSchema}},
      }),
    })
  }catch(error){
    if(error?.name==='AbortError')throw Object.assign(new Error('Nutrition calculation took too long. Please try again.'),{status:504})
    throw error
  }finally{clearTimeout(timeout)}
  const payload=await response.json().catch(()=>({}))
  if(!response.ok)throw Object.assign(new Error(payload.error?.message||'Nutrition calculation failed.'),{status:response.status})
  let parsed
  try{parsed=JSON.parse(outputText(payload))}catch{throw Object.assign(new Error('Brevity returned an invalid nutrition calculation.'),{status:502})}
  return calculateNutritionResult(request,parsed)
}
