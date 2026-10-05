import test from 'node:test'
import assert from 'node:assert/strict'
import {refreshAutomaticDay,effectiveMealDay,automaticMeals,automaticMealAllowed,mealVariety,applyMealScheduleCommand,scheduleCommandDates,householdIngredients,normalizeMealScheduleCommand,MEAL_SCHEDULE_RESOURCE} from './householdMealPlanning.js'
import {createRollingMealDay,resolveMealDay,addMealDays} from './mealPlanData.js'
import {proposeWeeklyGroceries} from '../household/groceryData.js'
import {captureExpectedVersions,prepareRecordOperations,createProductionActionResources,commitPreparedRecordOperations} from '../../netlify/lib/assistant-action-executor.mjs'
import {normalizeActionProposal} from '../../netlify/lib/assistant-action-contract.mjs'
import {bindRecipeOperation} from '../../netlify/lib/recipe-library-actions.mjs'
test('automatic meals meet household exclusions and variety across months, years and cycle boundaries',()=>{
 let previous=new Set()
 for(let i=0;i<400;i++){const meals=automaticMeals(addMealDays('2026-12-01',i)),veg=new Set(),meat=new Set();for(const slot of ['breakfast','lunch','dinner']){const meal=meals[slot];assert.ok(automaticMealAllowed(meal),meal.name);const traits=mealVariety(meal);for(const v of traits.vegetables){assert.ok(!veg.has(v)&&!previous.has(v),`${i}: ${v}`);veg.add(v)}for(const m of traits.meats){assert.ok(!meat.has(m),m);meat.add(m)}}previous=veg}
 for(const name of ['Whiting','Catfish','Salmon','Shrimp','Worcestershire with anchovies','Ground turkey','Turkey bacon','Turkey patties','Quinoa','Brussels sprouts','Tofu','Smoked salmon','Raw tuna'])assert.equal(automaticMealAllowed({name}),false,name)
 assert.notDeepEqual(mealVariety({name:'Chicken breast'}).meats,mealVariety({name:'Chicken thigh'}).meats)
})
test('moves swap full portions and custom meals without loss, including same-day slots',()=>{
 const a='2026-10-04',b='2026-10-07',base=Object.fromEntries([a,b].map(d=>[d,createRollingMealDay(d)]))
 let schedule=applyMealScheduleCommand({}, {kind:'set',date:a,slot:'breakfast',servings:4},base)
 schedule=applyMealScheduleCommand(schedule,{kind:'move',date:a,slot:'breakfast',toDate:b,toSlot:'lunch'},base)
 assert.equal(schedule.days[b].servings.lunch,4);assert.equal(schedule.days[b].meals.lunch,base[a].meals.breakfast);assert.equal(schedule.days[a].meals.breakfast,base[b].meals.lunch)
 const same=applyMealScheduleCommand(schedule,{kind:'move',date:b,slot:'lunch',toDate:b,toSlot:'dinner'},base);assert.equal(same.days[b].servings.dinner,4)
})
test('overlapping week shifts preserve seven original menus and clear only vacated days',()=>{
 for(const offset of [-3,-2,-1,1,2,3]){const command={kind:'shift-week',date:'2026-12-29',offset},base=Object.fromEntries(scheduleCommandDates(command).map(d=>[d,createRollingMealDay(d)])),result=applyMealScheduleCommand({},command,base)
 for(let i=0;i<7;i++)assert.deepEqual(result.days[addMealDays(command.date,i+offset)].meals,base[addMealDays(command.date,i)].meals)
 const vacant=offset>0?command.date:addMealDays(command.date,6);assert.ok(Object.values(result.days[vacant].meals).every(v=>v===null))}
})
test('one-person ingredient basis scales all components for six and respects dated four-person overrides',()=>{
 const meal={id:'test',name:'Chicken and asparagus',yieldQuantity:1,ingredients:['6 ounces chicken breast','10 asparagus spears']}
 assert.deepEqual(householdIngredients(meal),['36 oz chicken breast','60 asparagus spears'])
 const rows=proposeWeeklyGroceries([{date:'2026-10-04',servings:{dinner:4},resolvedMeals:{dinner:meal}}]).items
 assert.equal(rows.find(r=>r.name==='chicken breast').quantity,'24 oz');assert.equal(rows.find(r=>r.name==='asparagus spears').quantity,'40')
 assert.equal(proposeWeeklyGroceries([{date:'2026-10-04',resolvedMeals:{dinner:meal}}]).items.find(r=>r.name==='chicken breast').quantity,'36 oz')
})
test('custom meals resolve separately from shared library and preserve per-person macros',()=>{
 const date='2026-10-04',base=createRollingMealDay(date),recipe={name:'Steak plate',ingredients:['6 ounces cooked sirloin','1 cup cooked green beans'],instructions:['Cook and portion.'],macros:{calories:450,proteinGrams:40,carbohydrateGrams:10,fatGrams:25}}
 const schedule=applyMealScheduleCommand({}, {kind:'set',date,slot:'dinner',servings:4,recipe},{[date]:base}),resolved=resolveMealDay({...base,...schedule.days[date]})
 assert.equal(resolved.resolvedMeals.dinner.name,'Steak plate');assert.equal(resolved.resolvedMeals.dinner.macros.calories,450)
 assert.throws(()=>normalizeMealScheduleCommand({kind:'set',date,slot:'dinner',servings:0}),/people/)
 assert.throws(()=>normalizeMealScheduleCommand({kind:'set',date,slot:'dinner',servings:6,recipe:{...recipe,macros:{}}}),/nutrition/)
})
test('calendar Action Mode captures source records, rejects stale dependencies and requires planning permission',async()=>{
 const values=new Map(),resources={read:async key=>values.get(key)||{version:0,value:key.startsWith('meal:')?createRollingMealDay(key.slice(5)):key===MEAL_SCHEDULE_RESOURCE?{days:{}}:{}}}
 const input={summary:'Move meals',operations:[{type:'meal.schedule.update',targetId:'household-meal-calendar',targetDate:'2026-10-04',description:'Swap menus',payload:{commandJson:JSON.stringify({kind:'swap-day',date:'2026-10-04',toDate:'2026-10-05'})}}]}
 const proposal=await captureExpectedVersions(normalizeActionProposal(input,{member:'Larry',role:'admin'}),resources)
 const run=session=>prepareRecordOperations({proposal,resources,session,permissions:{}})
 const prepared=await run({member:'Larry',role:'admin'});assert.equal(prepared.prepared.length,1);assert.equal(prepared.prepared[0].resource,MEAL_SCHEDULE_RESOURCE)
 await assert.rejects(run({member:'Javin',role:'member'}),/not enabled/)
 values.set('meal:2026-10-05',{version:1,value:createRollingMealDay('2026-10-05')});await assert.rejects(run({member:'Larry',role:'admin'}),/changed after review/)
})
test('assistant custom meal recipes use server nutrition estimates, never authored macros',()=>{
 const operation={type:'meal.schedule.update',payloadJson:JSON.stringify({commandJson:JSON.stringify({kind:'set',date:'2026-10-04',slot:'dinner',servings:6,recipe:{name:'Steak',estimateId:'estimate',instructions:['Cook.'],macros:{calories:1}}})})}
 assert.throws(()=>bindRecipeOperation(operation,{library:[],estimates:new Map()}),/Calculate/)
 const estimate={yieldQuantity:1,ingredients:[{input:'6 ounces cooked steak'}],perServingMacros:{calories:400,proteinGrams:40,carbohydrateGrams:0,fatGrams:25}}
 const bound=bindRecipeOperation(operation,{library:[],estimates:new Map([['estimate',estimate]])});assert.deepEqual(JSON.parse(JSON.parse(bound.payloadJson).commandJson).recipe.macros,estimate.perServingMacros)
})

test('calendar changes persist atomically, reload in meal windows, reject stale saves and restore with Undo',async()=>{
 const {createMealPlanRepository}=await import('../../netlify/lib/meal-plan-store.mjs')
 const records=new Map(),tags=new Map();let sequence=0
 const store={get:async key=>structuredClone(records.get(key)||null),getWithMetadata:async key=>records.has(key)?{data:structuredClone(records.get(key)),etag:tags.get(key)}:null,setJSON:async(key,value,options={})=>{if(options.onlyIfNew&&records.has(key)||options.onlyIfMatch&&options.onlyIfMatch!==tags.get(key))return {modified:false};records.set(key,structuredClone(value));tags.set(key,String(++sequence));return {modified:true}}}
 const resources=createProductionActionResources({mealStore:store,sharedStore:store,planStore:store,sermonStore:store}),session={member:'Larry',role:'admin'}
 const proposal=await captureExpectedVersions(normalizeActionProposal({summary:'Dinner for four',operations:[{type:'meal.schedule.update',targetId:'household-meal-calendar',targetDate:'2026-10-04',description:'Four people for dinner',payload:{commandJson:JSON.stringify({kind:'set',date:'2026-10-04',slot:'dinner',servings:4})}}]},session),resources)
 const prepared=await prepareRecordOperations({proposal,session,permissions:{},resources});const before=await resources.read(MEAL_SCHEDULE_RESOURCE)
 await commitPreparedRecordOperations({prepared:prepared.prepared,session,resources,mutationId:'calendar-test'})
 const repository=createMealPlanRepository({store,householdId:'lslj-family'}),window=await repository.getWindowReadOnly({startDate:'2026-10-04',count:7})
 assert.equal(window.scheduleVersion,1);assert.equal(window.days[0].servings.dinner,4)
 await assert.rejects(prepareRecordOperations({proposal,session,permissions:{},resources}),/changed after your review/)
 await resources.write(MEAL_SCHEDULE_RESOURCE,before.value,1,'Larry','undo-calendar-test')
 const restored=await repository.getWindowReadOnly({startDate:'2026-10-04',count:1});assert.equal(restored.scheduleVersion,2);assert.equal(restored.days[0].servings?.dinner??6,6)
})

test('monthly generation respects neighboring saved menus and presents all proposed menus',async()=>{
 const {mealPlanWarnings}=await import('./householdMealPlanning.js')
 const date='2026-11-01',previous='2026-10-31',next='2026-12-01',store=new Map()
 const resources={read:async key=>store.get(key)||{version:0,value:key.startsWith('meal:')?createRollingMealDay(key.slice(5)):key===MEAL_SCHEDULE_RESOURCE?{days:{}}:{}}}
 const proposal=await captureExpectedVersions(normalizeActionProposal({summary:'Plan November',operations:[{type:'meal.schedule.update',targetId:'household-meal-calendar',targetDate:date,description:'Generate November',payload:{commandJson:JSON.stringify({kind:'generate',date,count:30})}}]},{member:'Larry',role:'admin'}),resources)
 const prepared=await prepareRecordOperations({proposal,resources,session:{member:'Larry',role:'admin'},permissions:{}})
 const all=[createRollingMealDay(previous),...Object.entries(prepared.prepared[0].after.days).map(([date,day])=>({...day,date})),createRollingMealDay(next)].map(day=>resolveMealDay(day))
 assert.deepEqual(mealPlanWarnings(all),[]);assert.equal(proposal.operations[0].mealReview.length,30)
 assert.ok(Object.hasOwn(proposal.operations[0].mealContext.versions,`meal:${next}`))
})

test('default automatic menus avoid recipe repeats in every rolling week across the cycle boundary',async()=>{
 const {mealPlanWarnings}=await import('./householdMealPlanning.js')
 const days=Array.from({length:400},(_,i)=>{const date=addMealDays('2026-10-01',i);return {date,resolvedMeals:automaticMeals(date)}})
 assert.deepEqual(mealPlanWarnings(days).filter(w=>w.includes('within seven days')),[])
})
test('range scheduling considers six days on either side and excludes snacks from recipe variety',async()=>{
 const {generateSafeMealRange,mealPlanWarnings}=await import('./householdMealPlanning.js')
 const slots=['breakfast','lunch','dinner'],library=slots.flatMap(slot=>Array.from({length:20},(_,i)=>({id:`${slot}-${i}`,name:`Cooked ${slot} ${i}`,mealType:slot,ingredients:['1 cup oats']})))
 const dates=Array.from({length:7},(_,i)=>addMealDays('2026-10-10',i))
 const day=(date,i)=>({date,resolvedMeals:Object.fromEntries(slots.map(slot=>[slot,library.find(m=>m.id===`${slot}-${i}`)]))})
 const previousDays=Array.from({length:6},(_,i)=>day(addMealDays(dates[0],i-6),i)),nextDays=Array.from({length:6},(_,i)=>day(addMealDays(dates.at(-1),i+1),i+7))
 const menus=generateSafeMealRange(dates,{previous:previousDays.at(-1),next:nextDays[0],previousDays,nextDays,library})
 assert.deepEqual(mealPlanWarnings([...previousDays,...dates.map(date=>({date,resolvedMeals:menus[date]})),...nextDays]).filter(w=>w.includes('within seven days')),[])
 const snack={name:'Daily snack'}
 assert.deepEqual(mealPlanWarnings(dates.map(date=>({date,resolvedMeals:{snack1:snack}}))),[])
})
test('a small eligible library repeats transparently without relaxing hard food constraints',async()=>{
 const {generateSafeMealRange,mealPlanWarnings}=await import('./householdMealPlanning.js')
 const library=['breakfast','lunch','dinner'].map(slot=>({id:slot,name:`Cooked ${slot}`,mealType:slot,ingredients:['1 cup oats']}))
 library.push({id:'seafood',name:'Salmon',mealType:'dinner',ingredients:['6 oz salmon']})
 const dates=Array.from({length:7},(_,i)=>addMealDays('2026-10-10',i)),menus=generateSafeMealRange(dates,{library})
 for(const menu of Object.values(menus))for(const slot of ['breakfast','lunch','dinner'])assert.equal(menu[slot].id,slot)
 assert.equal(mealPlanWarnings(dates.map(date=>({date,resolvedMeals:menus[date]}))).filter(w=>w.includes('within seven days')).length,18)
})

test('automatic snacks start empty while deliberate snack choices survive refresh and schedule edits',()=>{
 const date='2026-10-04',base=createRollingMealDay(date)
 assert.equal(base.meals.snack1,null);assert.equal(base.meals.snack2,null)
 const old={...base,meals:{...base.meals,snack1:'snack-premier-chocolate',snack2:'snack-envy-apple'}}
 const cleared=refreshAutomaticDay(old)
 assert.equal(cleared.meals.snack1,null);assert.equal(cleared.meals.snack2,null)
 const legacySchedule={days:{[date]:{meals:old.meals,substitutions:{dinner:{customized:true}}}}}
 assert.equal(effectiveMealDay(cleared,legacySchedule).meals.snack1,null)
 const edited=applyMealScheduleCommand(legacySchedule,{kind:'set',date,slot:'snack1',mealId:'snack-envy-apple',servings:1},{[date]:cleared})
 const saved=effectiveMealDay(cleared,edited)
 assert.equal(saved.meals.snack1,'snack-envy-apple');assert.equal(saved.servings.snack1,1);assert.equal(saved.meals.snack2,null)
})
test('skipping dinner inserts an empty day and shifts dinners with portions across the week boundary',()=>{
 const c={kind:'skip',date:'2026-10-05',slot:'dinner'},schedule={days:{'2026-10-12':{meals:{dinner:'saved-potroast'},servings:{dinner:4},recipes:{dinner:{name:'Custom roast',image:'photo'}}}}}
 const dates=scheduleCommandDates(c,schedule),base=Object.fromEntries(dates.map(date=>[date,createRollingMealDay(date)]))
 schedule.days['2026-10-12'].meals={...base['2026-10-12'].meals,dinner:'saved-potroast'}
 const result=applyMealScheduleCommand(schedule,c,base)
 assert.equal(result.days[c.date].meals.dinner,null)
 for(let i=1;i<dates.length-1;i++)assert.equal(result.days[dates[i]].meals.dinner,base[dates[i-1]].meals.dinner)
 assert.equal(result.days['2026-10-13'].meals.dinner,'saved-potroast')
 assert.equal(result.days['2026-10-13'].servings.dinner,4)
 assert.equal(result.days['2026-10-13'].recipes.dinner.image,'photo')
 for(const date of dates){assert.equal(result.days[date].meals.breakfast,base[date].meals.breakfast);assert.equal(result.days[date].meals.lunch,base[date].meals.lunch)}
 assert.throws(()=>normalizeMealScheduleCommand({...c,slot:'invalid'}))
})
