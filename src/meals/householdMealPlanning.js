import {mealReadyForPlanning} from './mealCategories.js'
import {MEAL_LIBRARY} from './mealLibrary.js'
import {parseGroceryIngredient} from '../household/groceryData.js'
export const HOUSEHOLD_MEAL_SERVINGS=6
export const MEAL_SCHEDULE_RESOURCE='meal-schedule:household'
export const MEAL_POLICY_NOTICE='Automatic plans exclude all seafood, quinoa, Brussels sprouts, tofu, ground turkey, turkey patties and turkey bacon. Cooked meals only. Vegetable sides do not repeat today or tomorrow; exact meat cuts do not repeat within a day. Breakfast, lunch and dinner recipes are kept different within seven days wherever the eligible library allows.'
const textOf=meal=>[meal?.name,meal?.description,...(meal?.ingredients||[])].join(' ').toLowerCase().replace(/[-–]/g,' ')
const seafood=/\b(salmon|whiting|catfish|fish|seafood|shrimp|prawn|crab|lobster|scallop|clam|mussel|oyster|tuna|trout|cod|tilapia|grouper|mahi|anchov|sardine|surimi|bonito|dashi|squid|octopus|swordfish|haddock|halibut|pollock|sole|flounder|herring|mackerel|snapper|perch|bass|eel|crawfish|crayfish|langoustine|abalone|conch|roe|caviar)\w*\b/
export const containsSeafood=meal=>seafood.test(textOf(meal))
export function automaticMealAllowed(meal){
 const text=textOf(meal)
 return mealReadyForPlanning(meal)&&!containsSeafood(meal)&&!(/worcester|worchest|quinoa|brussels? sprouts?|tofu|ground turkey|turkey (?:patty|patties|bacon|meatball)|turkey sausage|minced turkey|tartare|carpaccio|ceviche|sashimi|sushi|poke bowl|raw |smoked salmon|salad|cucumber|smoothie|overnight|yogurt|cottage cheese|ricotta|chia pudding/.test(text))
}
const vegetables=['broccoli','asparagus','green beans','spinach','kale','cauliflower','cabbage','carrot','zucchini','yellow squash','bell pepper','collard greens','okra','sweet potato','mushroom','tomato','corn','romaine','cucumber','potato','onion','eggplant','peas','beet','turnip','pumpkin']
export function mealVariety(meal){
 const text=textOf(meal?.ingredients?.length?{ingredients:meal.ingredients}:meal)
 const veg=vegetables.filter(name=>new RegExp(name.replace(/ /g,'[ -]')).test(text))
 const meats=[]
 for(const [kind,pattern] of Object.entries({chicken:/chicken/,turkey:/turkey/,pork:/pork/,beef:/beef|steak|sirloin/,lamb:/lamb/}))if(pattern.test(text)){
  const cut=kind==='chicken'?(/thigh/.test(text)?'thigh':/wing/.test(text)?'wing':/drumstick/.test(text)?'drumstick':'breast'):kind==='turkey'?(/tenderloin/.test(text)?'tenderloin':'breast'):kind==='pork'?(/chop/.test(text)?'chop':'tenderloin'):kind==='beef'?(/ground|patty|patties|meatball/.test(text)?'ground':/sirloin/.test(text)?'sirloin':/ribeye|rib eye/.test(text)?'ribeye':/filet|beef tenderloin/.test(text)?'tenderloin':/flank/.test(text)?'flank':'steak'):'loin'
  meats.push(`${kind}:${cut}`)
 }
 return {vegetables:veg,meats}
}
const mainSlots=['breakfast','lunch','dinner']
const recipeKey=meal=>String(meal?.name||meal?.id||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const mainMeals=menu=>mainSlots.map(slot=>menu?.[slot]).filter(Boolean)
const recentRecipeKeys=menus=>new Set(menus.flatMap(mainMeals).map(recipeKey))
const preferFresh=(meals,recent)=>meals.map((meal,index)=>({meal,index})).sort((a,b)=>Number(recent.has(recipeKey(a.meal)))-Number(recent.has(recipeKey(b.meal)))||a.index-b.index).map(item=>item.meal)
const cycles=new WeakMap()
export function automaticMeals(date,library=MEAL_LIBRARY){
 let cycle=cycles.get(library)
 if(!cycle){
  const slots=['breakfast','lunch','dinner'],pool=Object.fromEntries(slots.map(slot=>[slot,library.filter(meal=>(meal.mealType===slot||meal.mealType==='meal')&&automaticMealAllowed(meal))]))
  cycle=[]
  for(let day=0;day<42;day++){
   const previous=new Set(Object.values(cycle.at(-1)||{}).flatMap(meal=>mealVariety(meal).vegetables))
   const boundary=new Set(day===41?Object.values(cycle[0]).flatMap(meal=>mealVariety(meal).vegetables):[])
   const recent=recentRecipeKeys([...cycle.slice(-6),...(day>=36?cycle.slice(0,day-35):[])])
   const choose=(index,chosen,usedVeg,usedMeat,allowRepeats=false)=>{
    if(index===slots.length)return chosen
    const slot=slots[index],candidates=preferFresh(pool[slot].map((_,i)=>pool[slot][(i+day*7+index*11)%pool[slot].length]),recent)
    for(const meal of candidates){
     if(!allowRepeats&&(recent.has(recipeKey(meal))||mainMeals(chosen).some(m=>recipeKey(m)===recipeKey(meal))))continue
     const traits=mealVariety(meal)
     if(traits.vegetables.some(v=>previous.has(v)||boundary.has(v)||usedVeg.has(v))||traits.meats.some(m=>usedMeat.has(m)))continue
     const result=choose(index+1,{...chosen,[slot]:meal},new Set([...usedVeg,...traits.vegetables]),new Set([...usedMeat,...traits.meats]),allowRepeats)
     if(result)return result
    }
    return null
   }
   const selected=choose(0,{},new Set(),new Set())||choose(0,{},new Set(),new Set(),true)
   if(!selected)throw Error('The meal library needs more eligible cooked meals to satisfy household variety rules.')
   cycle.push(selected)
  }
  cycles.set(library,cycle)
 }
 const number=Math.floor(Date.parse(`${date}T00:00:00Z`)/86400000)
 return {...cycle[((number%42)+42)%42],snack1:library.find(m=>m.id==='snack-premier-chocolate'),snack2:library.find(m=>m.id==='snack-envy-apple')}
}
export function scaleIngredient(line,factor){const p=parseGroceryIngredient(line);return p.amount==null?line:`${Number((p.amount*factor).toFixed(3))} ${p.unit?`${p.unit} `:''}${p.name}`}
export function householdIngredients(meal,servings=6){return (meal?.ingredients||[]).map(line=>scaleIngredient(line,servings/(Number(meal.yieldQuantity)||1)))}
export function effectiveMealDay(day,schedule){
 const override=schedule?.days?.[day.date]
 return override?{...day,...override,date:day.date,scheduleEdited:true}:day
}
export function scheduleSlot(day,slot){return {mealId:day.meals?.[slot]||null,servings:day.servings?.[slot]??6,recipe:day.recipes?.[slot]||null}}
export function assignScheduleSlot(day,slot,value){return {...day,meals:{...day.meals,[slot]:value.mealId},servings:{...day.servings,[slot]:value.servings},recipes:{...day.recipes,[slot]:value.recipe},substitutions:{...day.substitutions,[slot]:{customized:true}}}}
export function normalizeMealScheduleCommand(input){
 const c=typeof input==='string'?JSON.parse(input):input
 if(!c||!['set','move','swap-day','move-day','shift-week','generate'].includes(c.kind))throw Error('Choose a supported meal calendar action.')
 const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&Number.isFinite(Date.parse(d))&&new Date(`${d}T12:00:00Z`).toISOString().slice(0,10)===d
 if(!validDate(c.date))throw Error('Choose an exact meal date.')
 const result={kind:c.kind,date:c.date}
 if(['move','swap-day','move-day'].includes(c.kind)){if(!validDate(c.toDate)||c.toDate===c.date&&c.kind!=='move')throw Error('Choose a different destination date.');result.toDate=c.toDate}
 const slots=['breakfast','lunch','dinner','snack1','snack2']
 if(['set','move'].includes(c.kind)){if(!slots.includes(c.slot))throw Error('Choose a meal slot.');result.slot=c.slot}
 if(c.kind==='move'){if(!slots.includes(c.toSlot)||c.date===c.toDate&&c.slot===c.toSlot)throw Error('Choose a different destination slot.');result.toSlot=c.toSlot}
 if(c.kind==='shift-week'){if(![-3,-2,-1,1,2,3].includes(c.offset))throw Error('Shift the week by one, two or three days.');result.offset=c.offset}
 if(c.kind==='generate'){if(!Number.isInteger(c.count)||c.count<1||c.count>31)throw Error('Choose up to 31 days.');result.count=c.count}
 if(c.kind==='set'){
  if(!Number.isInteger(c.servings)||c.servings<1||c.servings>100)throw Error('Choose 1–100 people.');result.servings=c.servings
  if(c.mealId!==undefined){if(typeof c.mealId!=='string'||c.mealId.length>160)throw Error('Choose a saved recipe.');result.mealId=c.mealId}
  if(c.recipe){const r=c.recipe;if(typeof r.name!=='string'||!r.name.trim()||r.name.length>200||!Array.isArray(r.ingredients)||!r.ingredients.length||r.ingredients.length>30||r.ingredients.some(s=>typeof s!=='string'||!s.trim()||s.length>300)||!Array.isArray(r.instructions)||!r.instructions.length||r.instructions.length>30||r.instructions.some(s=>typeof s!=='string'||s.length>1000))throw Error('A custom meal needs measured ingredients and cooking instructions.');const keys=['calories','proteinGrams','carbohydrateGrams','fatGrams'];if(keys.some(k=>typeof r.macros?.[k]!=='number'||!Number.isFinite(r.macros[k])||r.macros[k]<0||r.macros[k]>10000))throw Error('Calculate nutrition for the customized meal.');result.recipe={name:r.name.trim(),ingredients:r.ingredients,instructions:r.instructions,macros:Object.fromEntries(keys.map(k=>[k,r.macros[k]])),yieldQuantity:1,serving:'1 person',mealType:c.slot,nutritionBasis:'Estimated from the customized ingredients; per person.',description:'Customized for this scheduled meal.'}}
 }
 return result
}
export function scheduleCommandDates(c){const add=(d,n)=>new Date(Date.parse(`${d}T12:00:00Z`)+n*86400000).toISOString().slice(0,10);return [...new Set(c.kind==='generate'?Array.from({length:c.count},(_,i)=>add(c.date,i)):c.kind==='shift-week'?Array.from({length:7},(_,i)=>[add(c.date,i),add(c.date,i+c.offset)]).flat():[c.date,c.toDate].filter(Boolean))]}
export function applyMealScheduleCommand(schedule,command,baseDays){
 const c=normalizeMealScheduleCommand(command),days={...(schedule?.days||{})},get=date=>structuredClone(effectiveMealDay(baseDays[date],{days})),put=(date,day)=>{days[date]={meals:day.meals,servings:day.servings||{},recipes:day.recipes||{},substitutions:day.substitutions||{}}},empty=day=>({...day,meals:Object.fromEntries(Object.keys(day.meals).map(slot=>[slot,null])),recipes:{},servings:{}})
 if(c.kind==='set'){const day=get(c.date),old=scheduleSlot(day,c.slot);put(c.date,assignScheduleSlot(day,c.slot,{mealId:c.mealId??old.mealId,servings:c.servings,recipe:c.recipe??(c.mealId?null:old.recipe)}))}
 if(c.kind==='move'){const source=get(c.date),destination=c.date===c.toDate?source:get(c.toDate),a=scheduleSlot(source,c.slot),b=scheduleSlot(destination,c.toSlot);if(!a.mealId&&!a.recipe)throw Error('The source meal is empty.');if(c.date===c.toDate)put(c.date,assignScheduleSlot(assignScheduleSlot(source,c.slot,b),c.toSlot,a));else{put(c.date,assignScheduleSlot(source,c.slot,b));put(c.toDate,assignScheduleSlot(destination,c.toSlot,a))}}
 if(c.kind==='swap-day'||c.kind==='move-day'){const a=get(c.date),b=get(c.toDate);put(c.toDate,a);put(c.date,c.kind==='swap-day'?b:empty(a))}
 if(c.kind==='shift-week'){const dates=scheduleCommandDates({kind:'generate',date:c.date,count:7}),original=dates.map(get);dates.forEach(date=>put(date,empty(get(date))));dates.forEach((date,i)=>put(new Date(Date.parse(`${date}T12:00:00Z`)+c.offset*86400000).toISOString().slice(0,10),original[i]))}
 if(c.kind==='generate')for(const date of scheduleCommandDates(c)){put(date,{...baseDays[date],servings:Object.fromEntries(Object.keys(baseDays[date].meals).map(slot=>[slot,6])),recipes:{},substitutions:{}})}
 return {...schedule,days}
}
export function refreshAutomaticDay(day,library=MEAL_LIBRARY){
 const automatic=automaticMeals(day.date,library)
 return {...day,meals:Object.fromEntries(Object.entries(automatic).map(([slot,meal])=>[slot,day.substitutions?.[slot]?day.meals?.[slot]:meal?.id||null]))}
}
export function mealPlanWarnings(days){
 const warnings=[];let previous=new Set();const history=[]
 for(const day of [...days].sort((a,b)=>a.date.localeCompare(b.date))){const veg=new Set(),meats=new Set()
  const recent=recentRecipeKeys(history.filter(old=>Date.parse(day.date)-Date.parse(old.date)<7*86400000).map(old=>old.resolvedMeals))
  for(const meal of mainMeals(day.resolvedMeals)){if(recent.has(recipeKey(meal)))warnings.push(`${day.date}: ${meal.name} repeats within seven days. Choose another eligible recipe for more variety.`);recent.add(recipeKey(meal))}
  history.push(day)
  for(const meal of Object.values(day.resolvedMeals||{})){if(!meal)continue;const traits=mealVariety(meal)
   if(containsSeafood(meal))warnings.push(`${day.date}: ${meal.name} contains seafood; deliberate selection only.`)
   for(const v of traits.vegetables){if(veg.has(v)||previous.has(v))warnings.push(`${day.date}: ${v} repeats today or from yesterday.`);veg.add(v)}
   for(const m of traits.meats){if(meats.has(m))warnings.push(`${day.date}: ${m.replace(':',' ')} repeats.`);meats.add(m)}
  }previous=veg
 }return [...new Set(warnings)]
}
export function generateSafeMealRange(dates,{previous,next,previousDays=previous?[previous]:[],nextDays=next?[next]:[],library=MEAL_LIBRARY}={}){
 const traits=day=>Object.values(day?.resolvedMeals||{}).flatMap(meal=>mealVariety(meal).vegetables)
 let blocked=new Set(traits(previous));const nextVeg=new Set(traits(next)),result={}
 for(const [index,date] of dates.entries()){
  const preferred=automaticMeals(date,library),slots=['breakfast','lunch','dinner']
  const nearby=[...previousDays,...nextDays,...Object.entries(result).map(([date,resolvedMeals])=>({date,resolvedMeals}))].filter(day=>Math.abs(Date.parse(day.date)-Date.parse(date))<7*86400000)
  const recent=recentRecipeKeys(nearby.map(day=>day.resolvedMeals))
  const choose=(position,selected,veg,meat,allowRepeats=false)=>{
   if(position===slots.length)return selected
   const slot=slots[position],pool=preferFresh([preferred[slot],...library.filter(m=>(m.mealType===slot||m.mealType==='meal')&&m.id!==preferred[slot].id&&automaticMealAllowed(m))],recent)
   for(const meal of pool){if(!allowRepeats&&(recent.has(recipeKey(meal))||mainMeals(selected).some(m=>recipeKey(m)===recipeKey(meal))))continue;const t=mealVariety(meal);if(t.vegetables.some(v=>blocked.has(v)||veg.has(v)||index===dates.length-1&&nextVeg.has(v))||t.meats.some(m=>meat.has(m)))continue;const found=choose(position+1,{...selected,[slot]:meal},new Set([...veg,...t.vegetables]),new Set([...meat,...t.meats]),allowRepeats);if(found)return found}
   return null
  }
  const chosen=choose(0,{},new Set(),new Set())||choose(0,{},new Set(),new Set(),true);if(!chosen)throw Error(`No eligible menu satisfies the neighboring days on ${date}. Adjust adjacent menus before auto-scheduling.`)
  result[date]={...preferred,...chosen};blocked=new Set(Object.values(chosen).flatMap(meal=>mealVariety(meal).vegetables))
 }
 return result
}
