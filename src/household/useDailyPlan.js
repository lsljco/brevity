import { useCallback, useEffect, useRef, useState } from 'react'
import { createEmptyDailyPlan, normalizeDailyPlan } from './dailyPlan.js'
import { fetchDailyPlan } from './householdApi.js'
import { getHouseholdDateKey } from '../finance/financeTime.js'
import { ACTION_COMPLETED_EVENT } from '../assistant/actionEvents.js'

export const currentDailyPlanDate = (now = new Date()) => getHouseholdDateKey(now)

export function dailyPlanFromRefresh(detail, date) {
  if (!detail?.plan || detail.date !== date || detail.plan.date !== date) return null
  return normalizeDailyPlan(detail.plan)
}

export function useDailyPlan(date = currentDailyPlanDate()) {
  const [plan, setPlan] = useState(() => createEmptyDailyPlan(date))
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const requests = useRef(0)
  const mounted = useRef(true)
  const selectedDate = useRef(date)
  selectedDate.current = date

  const reload = useCallback(async () => {
    const request = ++requests.current
    setState('loading')
    setError('')
    try {
      const remote = await fetchDailyPlan(date)
      if (!mounted.current || request !== requests.current || selectedDate.current !== date) return
      if (remote && remote.date !== date) throw new Error('The returned plan does not match the selected date. Refresh before changing any responsibility.')
      setPlan(remote || createEmptyDailyPlan(date))
      setState('ready')
    } catch (err) {
      if (!mounted.current || request !== requests.current || selectedDate.current !== date) return
      setPlan(createEmptyDailyPlan(date))
      setError(err.message || 'Could not load the household plan.')
      setState('error')
    }
  }, [date])

  useEffect(() => {
    mounted.current = true
    reload()
    return () => { mounted.current = false; requests.current += 1 }
  }, [reload])

  useEffect(() => {
    const receiveRefresh = event => {
      const refreshedPlan = dailyPlanFromRefresh(event?.detail, date)
      if (!refreshedPlan) return
      requests.current += 1
      setPlan(refreshedPlan)
      setError('')
      setState('ready')
    }
    window.addEventListener('brevity-app-refreshed', receiveRefresh)
    return () => window.removeEventListener('brevity-app-refreshed', receiveRefresh)
  }, [date])

  useEffect(() => {
    const refreshAfterReviewedAction = event => {
      const operations = event?.detail?.audit?.operations || []
      if (!operations.some(operation => operation.targetDate === date && (operation.domain === 'planning' || operation.type?.startsWith('plan.')))) return
      reload()
    }
    window.addEventListener(ACTION_COMPLETED_EVENT, refreshAfterReviewedAction)
    return () => window.removeEventListener(ACTION_COMPLETED_EVENT, refreshAfterReviewedAction)
  }, [date, reload])

  // Never expose yesterday's record/version in the render between a date change
  // and the new request resolving. The server still checks the exact version.
  const matches = plan.date === date
  return { plan: matches ? plan : createEmptyDailyPlan(date), state: matches ? state : 'loading', error: matches ? error : '', reload }
}
