import {useEffect,useState} from 'react'
import {HOUSEHOLD_SCHEDULE_STORAGE_KEY} from './householdScheduleData.js'
import {SHARED_STATE_EVENT} from './sharedState.js'
import {ACTION_COMPLETED_EVENT} from '../assistant/actionEvents.js'
import {buildDailyAgenda} from './dailyAgenda.js'
import {householdClock} from './dailyRhythm.js'
export function useDailyAgenda(options){
 const [snapshot,setSnapshot]=useState({schedule:{},clock:householdClock()})
 useEffect(()=>{const refresh=()=>{let schedule={};try{schedule=JSON.parse(localStorage.getItem(HOUSEHOLD_SCHEDULE_STORAGE_KEY)||'{}')}catch{}setSnapshot({schedule,clock:householdClock()})};refresh();const timer=setInterval(refresh,30000);const events=[SHARED_STATE_EVENT,ACTION_COMPLETED_EVENT,'storage'];events.forEach(e=>window.addEventListener(e,refresh));return()=>{clearInterval(timer);events.forEach(e=>window.removeEventListener(e,refresh))}},[])
 return {...buildDailyAgenda({...options,schedule:snapshot.schedule,minute:options.plan.date===snapshot.clock.date?snapshot.clock.minute:0}),clock:snapshot.clock}
}
