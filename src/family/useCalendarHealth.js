import { useEffect, useState } from 'react'
import { calendarSnapshotHealth } from './calendarSnapshot.js'

// Freshness must age even when no new source response arrives.
export function useCalendarHealth(snapshot) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = window.setInterval(tick, 60_000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  // A response may arrive between ticks; never compare it to an older clock.
  return calendarSnapshotHealth(snapshot, { now: new Date(Math.max(now.getTime(), Date.now())) })
}
