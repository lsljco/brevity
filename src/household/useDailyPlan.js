import { useCallback, useEffect, useState } from 'react'
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

  const reload = useCallback(async () => {
    setState('loading')
    setError('')
    try {
      const remote = await fetchDailyPlan(date)
      setPlan(remote || createEmptyDailyPlan(date))
      setState('ready')
    } catch (err) {
      setPlan(createEmptyDailyPlan(date))
      setError(err.message || 'Could not load the household plan.')
      setState('error')
    }
  }, [date])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    const receiveRefresh = event => {
      const refreshedPlan = dailyPlanFromRefresh(event?.detail, date)
      if (!refreshedPlan) return
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

  return { plan, state, error, reload }
}
