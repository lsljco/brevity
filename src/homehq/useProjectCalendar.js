import {useEffect,useState} from 'react'
import {PROJECT_STORAGE_KEY,readJson,syncProjectCalendarEvents} from './projectData.js'
import {SHARED_STATE_EVENT} from '../household/sharedState.js'

export function useProjectCalendar(storage = globalThis.localStorage) {
  const read = () => syncProjectCalendarEvents(readJson(storage,PROJECT_STORAGE_KEY,[]))
  const [events,setEvents] = useState(read)
  useEffect(() => {
    const refresh = event => {
      if(event.type==='storage' && event.key && event.key!==PROJECT_STORAGE_KEY)return
      if(event.type===SHARED_STATE_EVENT && !event.detail?.keys?.includes(PROJECT_STORAGE_KEY))return
      setEvents(read())
    }
    window.addEventListener('storage',refresh)
    window.addEventListener(SHARED_STATE_EVENT,refresh)
    return () => {window.removeEventListener('storage',refresh);window.removeEventListener(SHARED_STATE_EVENT,refresh)}
  },[storage])
  return events
}
