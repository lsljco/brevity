import { useCallback, useEffect, useState } from 'react'
import { createEmptyDailyPlan, normalizeDailyPlan } from './dailyPlan.js'
import { fetchDailyPlan, saveDailyPlan } from './householdApi.js'

const localDateKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function useDailyPlan(date = localDateKey()) {
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

  const persist = useCallback(async next => {
    const previous = plan
    const candidate = normalizeDailyPlan(typeof next === 'function' ? next(plan) : next)
    setPlan(candidate)
    setState('saving')
    setError('')
    try {
      const saved = await saveDailyPlan(candidate)
      setPlan(saved)
      setState('ready')
      return saved
    } catch (err) {
      setPlan(err.currentPlan ? normalizeDailyPlan(err.currentPlan) : previous)
      setError(err.message || 'Could not save the household plan.')
      setState('error')
      throw err
    }
  }, [plan])

  return { plan, state, error, reload, savePlan: persist }
}
