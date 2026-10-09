import {routineOccurrencesForDate,normalizeHouseholdScheduleState} from '../../src/household/householdScheduleData.js'
import {buildHouseholdMaintenanceWeek,normalizeHouseholdMaintenanceState,householdOccurrence,occurrenceStatus} from '../../src/household/householdMaintenanceData.js'
import '../lib/native-runtime.mjs'
import {getStore} from '../lib/scoped-store.mjs'
import {reminderStore,reminderRoot,vapidKeys,dueReminders,deliverReminder} from '../lib/personal-reminders.mjs'
import {householdClock} from '../../src/household/dailyRhythm.js'
export default async function handler(){
 const store=reminderStore(),root=reminderRoot(),now=new Date()
 const data=getStore({name:'brevity-household',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
 const date=householdClock(now).date
 const shared=getStore({name:'brevity-household-state',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
 const [savedPlan,scheduleRecord,maintenanceRecord]=await Promise.all([data.get(`${root}daily-plans/${date}`,{type:'json'}),shared.get(`${root}records/brevity_household_schedule_v1`,{type:'json'}),shared.get(`${root}records/brevity_household_maintenance_v1`,{type:'json'})])
 const parse=record=>typeof record?.value==='string'?JSON.parse(record.value):record?.value||{}
 const schedule=normalizeHouseholdScheduleState(parse(scheduleRecord))
 const routines=routineOccurrencesForDate(schedule,date)
 const blocks=schedule.blocks.filter(block=>block.date===date).map(block=>({...block,participants:(block.participants||[]).filter(member=>block.attendance?.[member]==='accepted')}))
 const maintenance=normalizeHouseholdMaintenanceState(parse(maintenanceRecord))
 const chores=buildHouseholdMaintenanceWeek(new Date(`${date}T12:00:00`),maintenance).find(day=>day.date===date)?.tasks||[]
 const plan={...(savedPlan||{}),date,assignments:[...(savedPlan?.assignments||[]),...routines,...blocks,...chores.map(chore=>{const occurrence=householdOccurrence(maintenance,chore);return {...chore,id:chore.occurrenceId,status:occurrenceStatus(chore,occurrence),owners:occurrence.coveredBy?[occurrence.coveredBy]:chore.owners}})]}
 const keys=await vapidKeys(store)
 for await(const page of store.list({prefix:`${root}devices/`,paginate:true})){
  await Promise.all(page.blobs.map(async row=>{
   const device=await store.get(row.key,{type:'json'})
   if(!device)return
   for(const message of dueReminders(plan,device.member,device.preferences,now)){
    const sentKey=`${root}sent/${device.id}/${message.key}`
    const lock=await store.setJSON(sentKey,{attemptedAt:now.toISOString()},{onlyIfNew:true})
    if(lock?.modified===false)continue
    try{await deliverReminder(device.subscription,message,keys);await store.setJSON(sentKey,{sentAt:new Date().toISOString()})}
    catch(error){if([404,410].includes(error.statusCode))await store.delete(row.key);else await store.delete(sentKey)}
   }
  }))
 }
}
export const config={schedule:'* * * * *'}
