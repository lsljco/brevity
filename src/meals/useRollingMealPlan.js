import { useCallback, useEffect, useState } from 'react'
import { fetchRollingMealPlan, substituteMeal } from './mealPlanApi.js'

export function useRollingMealPlan() {
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setState('loading')
    setError('')
    try {
      const result = await fetchRollingMealPlan()
      setData(result)
      setState('ready')
      return result
    } catch (requestError) {
      setError(requestError.message || 'Could not load the household meal plan.')
      setState('error')
      throw requestError
    }
  }, [])

  useEffect(() => { reload().catch(() => undefined) }, [reload])

  const replace = useCallback(async ({ date, mealType, mealId, expectedVersion }) => {
    setState('saving')
    setError('')
    try {
      const result = await substituteMeal({ date, mealType, mealId, expectedVersion })
      setData(current => ({ ...current, days: current.days.map(day => day.date === result.day.date ? result.day : day) }))
      setState('ready')
      return result.day
    } catch (requestError) {
      setError(requestError.message || 'Could not replace this meal.')
      setState('error')
      throw requestError
    }
  }, [])

  return { data, state, error, reload, replace }
}
