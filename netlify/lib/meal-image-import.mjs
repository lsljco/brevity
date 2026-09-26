const MODEL=process.env.BREVITY_MEAL_IMPORT_MODEL||'gpt-4.1-mini'
const MAX_BYTES=5*1024*1024
const schema={type:'object',additionalProperties:false,required:['meals','warnings'],properties:{
  meals:{type:'array',items:{type:'object',additionalProperties:false,required:['name','mealType','ingredients','calories','proteinGrams','carbohydrateGrams','fatGrams','serving','warnings'],properties:{
    name:{type:'string'},mealType:{type:'string',enum:['breakfast','lunch','dinner']},ingredients:{type:'array',items:{type:'string'}},calories:{type:['number','null']},proteinGrams:{type:['number','null']},carbohydrateGrams:{type:['number','null']},fatGrams:{type:['number','null']},serving:{type:'string'},warnings:{type:'array',items:{type:'string'}},
  }}},warnings:{type:'array',items:{type:'string'}},
}}
const outputText=payload=>(payload.output||[]).flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text).join('')
const fail=(message,status=400)=>Object.assign(new Error(message),{status})
const normalizeNumber=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.round(value):null

export function validateMealImageImport(body){
  if(!['image/jpeg','image/png','image/webp'].includes(body?.mimeType))throw fail('Choose a JPEG, PNG, or WebP image.')
  const encoded=String(body?.imageBase64||'')
  if(!encoded||encoded.length>Math.ceil(MAX_BYTES*4/3)+8||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw fail('Choose an image smaller than 5 MB.')
  const bytes=Buffer.from(encoded,'base64')
  if(!bytes.length||bytes.length>MAX_BYTES)throw fail('Choose an image smaller than 5 MB.')
  const signature=bytes.subarray(0,12)
  const jpeg=signature[0]===0xff&&signature[1]===0xd8&&signature[2]===0xff
  const png=signature.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  const webp=signature.toString('ascii',0,4)==='RIFF'&&signature.toString('ascii',8,12)==='WEBP'
  if(!(body.mimeType==='image/jpeg'&&jpeg||body.mimeType==='image/png'&&png||body.mimeType==='image/webp'&&webp))throw fail('The image contents do not match its file type.')
  return {mimeType:body.mimeType,imageBase64:encoded}
}

export async function analyzeMealImage(body,{fetcher=globalThis.fetch}={}){
  const image=validateMealImageImport(body)
  if(!process.env.OPENAI_API_KEY)throw fail('Brevity image import is not configured.',503)
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000)
  let response
  try{response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',signal:controller.signal,headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:MODEL,store:false,max_output_tokens:6500,instructions:'Read a meal graphic carefully. Extract each distinct plated meal as a separate draft. Use the printed Breakfast, Lunch, Dinner heading for mealType, or choose the most appropriate type if absent. Copy meal names, ingredient names and ALL FOUR per-plate macro figures only when actually printed. For a core meal and optional carb variant, use the core meal figures and describe the optional variant and its printed figures in warnings; do not count it as a second plated meal. Do not infer portions, cooking instructions, preparation time, hidden ingredients or nutrition from the photograph. Return null for any missing or illegible macro number and explain uncertainty in warnings. An ingredient shown by name without amount stays just its name. Ignore marketing claims and daily totals. Never silently combine meals.',input:[{role:'user',content:[{type:'input_text',text:'Extract up to 30 separate meals and their explicitly displayed calories, protein, carbohydrates and fat. Include all meal cards on a weekly menu. Each draft requires household review before saving.'},{type:'input_image',image_url:`data:${image.mimeType};base64,${image.imageBase64}`}]}],text:{format:{type:'json_schema',name:'meal_image_import',strict:true,schema}}})})}catch(error){if(error.name==='AbortError')throw fail('Image analysis timed out. Try again.',504);throw error}finally{clearTimeout(timer)}
  const payload=await response.json().catch(()=>({}))
  if(!response.ok)throw fail(payload.error?.message||'Brevity could not analyze this image.',response.status)
  let parsed
  try{parsed=JSON.parse(outputText(payload))}catch{throw fail('Brevity returned an unreadable meal draft.',502)}
  return {meals:(Array.isArray(parsed.meals)?parsed.meals:[]).slice(0,30).map(meal=>({name:String(meal.name||'').trim().slice(0,160),mealType:['breakfast','lunch','dinner'].includes(meal.mealType)?meal.mealType:'lunch',ingredients:(Array.isArray(meal.ingredients)?meal.ingredients:[]).map(value=>String(value||'').trim().slice(0,240)).filter(Boolean),serving:String(meal.serving||'').trim().slice(0,80),macros:{calories:normalizeNumber(meal.calories),proteinGrams:normalizeNumber(meal.proteinGrams),carbohydrateGrams:normalizeNumber(meal.carbohydrateGrams),fatGrams:normalizeNumber(meal.fatGrams)},warnings:(Array.isArray(meal.warnings)?meal.warnings:[]).map(String)})).filter(meal=>meal.name),warnings:(Array.isArray(parsed.warnings)?parsed.warnings:[]).map(String)}
}
