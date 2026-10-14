import {loadOpenWork} from './open-work.mjs'
import {getStore} from './scoped-store.mjs'
import {reminderRoot} from './personal-reminders.mjs'
import {productionMealPlanRepository} from './meal-plan-store.mjs'
import {productionAssistantActionRepository} from './assistant-action-repository.mjs'
export const briefingStore=()=>getStore({name:'brevity-daily-briefings',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
export async function loadDailyBriefingInputs(date,{now=new Date()}={}){
 const options={consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN},root=reminderRoot()
 const shared=getStore({name:'brevity-household-state',...options}),plans=getStore({name:'brevity-household',...options})
 const keys={schedule:'brevity_household_schedule_v1',maintenance:'brevity_household_maintenance_v1',projects:'homehq_items_v1',localCalendar:'family_calendar_events_v1',finance:'lslj_finance_v9',actuals:'plaid_actuals_cache'}
 const readers=[['openWork',()=>loadOpenWork(date)],['plan',()=>plans.get(`${root}daily-plans/${date}`,{type:'json'})],...Object.entries(keys).map(([name,key])=>[name,async()=>{const record=await shared.get(`${root}records/${key}`,{type:'json'});return {value:typeof record?.value==='string'?JSON.parse(record.value):record?.value,updatedAt:record?.updatedAt||''}}]),['calendar',()=>briefingStore().get(`${root}calendar`,{type:'json'})],['meals',async()=>{const repo=await productionMealPlanRepository();return (await repo.getWindowReadOnly({startDate:date,count:1})).days[0]?.resolvedMeals}],['permissions',()=>productionAssistantActionRepository().getPermissions()]]
 const results=await Promise.allSettled(readers.map(([,read])=>read())),data={},sources={}
 readers.forEach(([key],index)=>{const r=results[index];if(r.status==='fulfilled'){data[key]=r.value;sources[key]=r.value==null||Object.hasOwn(r.value,'value')&&r.value.value==null?'missing':'available'}else sources[key]='unavailable'})
 const calendar=data.calendar
 sources.calendar=calendar?.checkedAt&&now-Date.parse(calendar.checkedAt)<15*60000&&!calendar.error?'available':'unavailable'
 return {date,openWork:data.openWork||[],plan:data.plan||{},schedule:data.schedule?.value||{},maintenance:data.maintenance?.value||{},projects:data.projects?.value||[],calendar:[...(Array.isArray(calendar?.events)?calendar.events:[]),...(Array.isArray(data.localCalendar?.value)?data.localCalendar.value:[])],calendarCheckedAt:calendar?.checkedAt||'',meals:data.meals||{},finance:data.finance?.value,actuals:data.actuals?.value,updatedAt:data.finance?.updatedAt||'',sources,permissions:data.permissions||{}}
}
export async function memberRole(member){
 const user=await getStore({name:'brevity-household-auth',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN}).get(`users/${member.toLowerCase()}`,{type:'json'})
 return user?.role||null
}
export const financeBriefAllowed=(member,role,permissions)=>role==='admin'||permissions?.[member]?.finance===true
