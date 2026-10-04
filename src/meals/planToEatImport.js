import {mealReadyForPlanning} from './mealCategories.js'
// RFC 4180-style quoted cells, including escaped quotes and multiline recipes.
export function parseRecipeCsv(text){
 if(typeof text!=='string'||text.length>4_000_000)throw Error('Choose a CSV export smaller than 4 MB.')
 const rows=[];let row=[],cell='',quoted=false
 text=text.replace(/^\uFEFF/,'')
 for(let i=0;i<text.length;i++){const c=text[i]
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else if(quoted||!cell)quoted=!quoted;else cell+=c}
  else if(c===','&&!quoted){row.push(cell);cell=''}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell=''}
  else cell+=c
 }
 if(quoted)throw Error('The CSV ends inside a quoted cell. Export the complete file again.')
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row)
 const headers=rows.shift()?.map(h=>h.trim())||[]
 if(!['Title','Ingredients','Directions','Servings','Public Url'].every(h=>headers.includes(h)))throw Error('Choose the original Plan to Eat recipe CSV export.')
 if(rows.length>1000)throw Error('Import no more than 1,000 recipes at a time.')
 return rows.map((values,index)=>{if(values.length!==headers.length)throw Error(`CSV row ${index+2} has the wrong number of columns.`);return Object.fromEntries(headers.map((header,i)=>[header,values[i]]))})
}
const number=value=>{const match=String(value??'').trim().match(/^(\d+(?:,\d{3})*(?:\.\d+)?)(?:\s*(?:g|mg|kcal|calories|cal))?$/i);return match?Number(match[1].replaceAll(',','')):null}
const lines=value=>String(value||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
const safeUrl=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
export function planToEatMeals(csv){
 return parseRecipeCsv(csv).map((r,index)=>{
  if(!r.Title.trim())throw Error(`Recipe ${index+1} needs a title.`)
  const publicUrl=safeUrl(r['Public Url']),match=publicUrl.match(/^https:\/\/app\.plantoeat\.com\/recipes\/(\d+)\/?$/)
  if(!match)throw Error(`Recipe ${index+1} has no valid Plan to Eat recipe identity.`)
  const course=String(r.Course||'').toLowerCase(),mealType=/side|salad|sauce|condiment|dessert|bread|appetizer/.test(course)?'side':/shake|drink|beverage|ingredient/.test(course)?'ingredient':'meal'
  const yieldQuantity=number(r.Servings),yieldNumber=String(r.Yield||'').match(/^\s*(\d+(?:\.\d+)?)(?:\s+servings?)?\s*$/i)
  const macros={calories:number(r.Calories),fatGrams:number(r.Fat),proteinGrams:number(r.Protein),carbohydrateGrams:number(r.Carbohydrate)}
  const warnings=[]
  if(Object.values(macros).some(v=>v===null))warnings.push('Nutrition is incomplete in the export. Calculate from measured ingredients before planning.')
  if(!lines(r.Ingredients).length)warnings.push('Ingredients are missing from the export.')
  if(!lines(r.Directions).length)warnings.push('Directions are missing from the export.')
  const ambiguousYield=!yieldQuantity||Boolean(yieldNumber&&Number(yieldNumber[1])!==yieldQuantity)||(yieldQuantity===1&&!String(r.Yield||'').trim()&&lines(r.Ingredients).length>1)
  if(ambiguousYield)warnings.push('Confirm the batch serving yield before planning; the source yield is missing or inconsistent.')
  return {id:`custom-plantoeat-${match[1]}`,custom:true,mealType,name:r.Title.trim(),description:String(r.Description||'').trim()||r.Title.trim(),ingredients:lines(r.Ingredients),instructions:lines(r.Directions),
   prepMinutes:number(r['Prep Time'])||0,cookMinutes:number(r['Cook Time'])||0,totalMinutes:number(r['Total Time'])||0,timingRecorded:Boolean(number(r['Total Time'])),
   yieldQuantity,yieldUnit:'servings',serving:'1 serving',macros,image:safeUrl(r['Photo Url']),sourceUrl:safeUrl(r.Url)||publicUrl,sourceName:'Plan to Eat',
   nutritionBasis:'Per-serving values imported from Plan to Eat; missing values are unknown, not zero.',nutritionWarnings:warnings,importSource:publicUrl,importReviewRequired:ambiguousYield,
   sourceExport:r,tags:['household custom','Plan to Eat import']}
 })
}
export function previewPlanToEatImport(csv,library=[]){
 const meals=planToEatMeals(csv),knownIds=new Set(library.map(m=>m.importSource||m.id)),added=[],skipped=[]
 for(const meal of meals){if(knownIds.has(meal.importSource)||knownIds.has(meal.id)){skipped.push(meal.name);continue}knownIds.add(meal.importSource);added.push(meal)}
 return {meals:added,total:meals.length,skipped,needsReview:added.filter(m=>!mealReadyForPlanning(m)).length}
}
