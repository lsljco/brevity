import {useEffect,useState} from 'react'
import {useProjectCalendar} from '../homehq/useProjectCalendar.js'
import {SHARED_STATE_EVENT} from '../household/sharedState.js'
import {APP_REFRESH_EVENT} from '../household/appRefresh.js'
import {readCurrentCalendarSnapshot} from './calendarSnapshot.js'
import {combineCalendarRecords,familyCalendarDay,normalizeIcloud,readLocalCalendarRecords} from './calendarReadModel.js'

export function useFamilyCalendarDay(date) {
 const read=()=>({...readLocalCalendarRecords(date),icloudEvents:(readCurrentCalendarSnapshot()?.events||[]).map(normalizeIcloud)})
 const [records,setRecords]=useState(read)
 const projectEvents=useProjectCalendar()
 useEffect(()=>{
  const refresh=event=>setRecords({...read(),...(event?.type==='brevity-icloud-calendar-refreshed'?{icloudEvents:(event.detail?.events||[]).map(normalizeIcloud)}:{})})
  refresh()
  const events=['storage',SHARED_STATE_EVENT,APP_REFRESH_EVENT,'brevity-family-calendar-updated','brevity-icloud-calendar-refreshed']
  events.forEach(name=>window.addEventListener(name,refresh))
  return()=>events.forEach(name=>window.removeEventListener(name,refresh))
 },[date])
 return familyCalendarDay(combineCalendarRecords({...records,projectEvents}),date)
}
