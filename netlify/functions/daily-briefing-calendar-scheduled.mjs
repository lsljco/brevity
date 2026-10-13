import '../lib/native-runtime.mjs'
import {createICloudCalendarHandler} from './icloud-calendar.mjs'
import {briefingStore} from '../lib/daily-briefing-source.mjs'
import {reminderRoot} from '../lib/personal-reminders.mjs'
// Internal, read-only calendar snapshot. The public calendar handler retains its authentication gate.
export default async function handler(){
 const store=briefingStore(),key=`${reminderRoot()}calendar`
 try{
  const read=createICloudCalendarHandler({authenticate:async()=>({member:'Larry',role:'admin'})})
  const response=await read({httpMethod:'GET',headers:{},queryStringParameters:{}})
  if(response.statusCode!==200)throw Error('Calendar refresh unavailable')
  const data=JSON.parse(response.body)
  await store.setJSON(key,{events:data.events,checkedAt:new Date().toISOString()})
 }catch{
  const existing=await store.get(key,{type:'json'})
  await store.setJSON(key,{...(existing||{}),error:true,lastAttemptAt:new Date().toISOString()})
 }
}
export const config={schedule:'*/5 * * * *'}
