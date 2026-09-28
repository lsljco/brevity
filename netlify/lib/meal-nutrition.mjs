const MODEL = process.env.OPENAI_NUTRITION_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini'

const macroFields = ['calories','proteinGrams','carbohydrateGrams','fatGrams']
const optionalNutrients=['fiberGrams','sugarGrams','sodiumMilligrams']
const numeric = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}
const round = (value, places = 1) => Number(numeric(value).toFixed(places))

// Manufacturer serving labels provide a useful upper bound when the exact variant
// is missing. Reject large model errors; let the member check the package label.
const brandedServingChecks = [
  {matches:/(?=.*\beckrich\b)(?=.*\bsmoked sausage\b)/i,amount:/\b(\d+(?:\.\d+)?)\s*(?:oz|ounces?)\b/i,caloriesPerUnit:200/2,proteinPerUnit:7/2},
  {matches:/(?=.*\bpremier protein\b)(?=.*\bshake\b)/i,amount:/\b(\d+(?:\.\d+)?)\s*(?:shakes?|bottles?|cartons?)\b/i,caloriesPerUnit:200,proteinPerUnit:42},
  {matches:/(?=.*\bnature.s own\b)(?=.*\bhoney wheat\b)/i,amount:/\b(\d+(?:\.\d+)?)\s*(?:slices?|pieces?)(?:\s+of)?\b/i,caloriesPerUnit:70,proteinPerUnit:4},
]

function checkBrandedServings(input, row) {
  for(const reference of brandedServingChecks){
    if(!reference.matches.test(input))continue
    const quantity=Number(input.match(reference.amount)?.[1])
    if(!Number.isFinite(quantity)||quantity<=0)continue
    if(row.calories>quantity*reference.caloriesPerUnit*1.35 || row.proteinGrams>quantity*reference.proteinPerUnit*1.35){
      throw Object.assign(new Error(`The estimated nutrition for “${input}” is inconsistent with typical package servings. Check the exact product label and try again before saving.`),{code:'NUTRITION_REVIEW_REQUIRED',status:422})
    }
  }
}

export const nutritionSchema = {
  type:'object',
  additionalProperties:false,
  required:['ingredients','warnings'],
  properties:{
    ingredients:{type:'array',minItems:1,maxItems:30,items:{
      type:'object',additionalProperties:false,
      required:['input','resolvedName','amountDescription','calories','proteinGrams','carbohydrateGrams','fatGrams','fiberGrams','sugarGrams','sodiumMilligrams','basis','confidence'],
      properties:{
        input:{type:'string'},resolvedName:{type:'string'},amountDescription:{type:'string'},
        calories:{type:'number',minimum:0},proteinGrams:{type:'number',minimum:0},
        carbohydrateGrams:{type:'number',minimum:0},fatGrams:{type:'number',minimum:0},
        fiberGrams:{type:['number','null'],minimum:0},sugarGrams:{type:['number','null'],minimum:0},sodiumMilligrams:{type:['number','null'],minimum:0},
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
  const ingredients=rows.map((row,index)=>{
    checkBrandedServings(normalized.ingredients[index],row)
    return ({
    input:normalized.ingredients[index],
    resolvedName:String(row.resolvedName||normalized.ingredients[index]).trim(),
    amountDescription:String(row.amountDescription||normalized.ingredients[index]).trim(),
    basis:String(row.basis||'Standard nutrition reference estimate').trim(),
    confidence:['high','medium','low'].includes(row.confidence)?row.confidence:'low',
    macros:Object.fromEntries(macroFields.map(field=>[field,round(row[field])])),
    nutrients:Object.fromEntries(optionalNutrients.map(field=>[field,typeof row[field]==='number'&&Number.isFinite(row[field])&&row[field]>=0?round(row[field]):null])),
  })})
  const batchMacros=Object.fromEntries(macroFields.map(field=>[field,round(ingredients.reduce((sum,row)=>sum+row.macros[field],0))]))
  const perServingMacros=Object.fromEntries(macroFields.map(field=>[field,round(batchMacros[field]/normalized.yieldQuantity)]))
  const batchNutrients=Object.fromEntries(optionalNutrients.map(field=>[field,ingredients.every(row=>row.nutrients[field]!==null)?round(ingredients.reduce((sum,row)=>sum+row.nutrients[field],0)):null]))
  const perServingNutrients=Object.fromEntries(optionalNutrients.map(field=>[field,batchNutrients[field]===null?null:round(batchNutrients[field]/normalized.yieldQuantity)]))
  const unit=normalized.yieldQuantity===1?normalized.yieldUnit:normalized.yieldUnit.replace(/s$/i,'')
  return {
    ...normalized,
    serving:`1 ${unit}`,
    ingredients,
    batchMacros,
    perServingMacros,
    batchNutrients,
    perServingNutrients,
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
        instructions:'Act as a careful recipe nutrition calculator. For each ingredient line, estimate nutrition for the entire stated amount—not one serving. Honor brand and product names when supplied and explain the label or standard-food basis briefly. For packaged food, first identify the label serving size, multiply all four macros by the stated number of servings, then report the result. As anchors: Eckrich Original Skinless Smoked Sausage is 190 calories and 6g protein per 2 oz; Premier Protein Classic shake is 160 calories and 30g protein per bottle; Nature’s Own Honey Wheat is 70 calories per slice. These anchors are only for those variants; disclose any uncertainty about the exact product. Fiber, sugar, and sodium must be null when the exact product label or reliable standard reference is unavailable; never invent precision. Water contributes zero macros. Never omit an ingredient, never invent an extra ingredient, and mark ambiguity or uncertain brand variants in warnings. Values are estimates, not medical advice.',
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
