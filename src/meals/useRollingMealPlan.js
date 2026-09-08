import { useCallback, useEffect, useState } from 'react'
import { executeMealSubstitution, fetchRollingMealPlan, prepareMealSubstitution } from './mealPlanApi.js'

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

  const prepareReplacement = useCallback(async ({ date, mealType, mealId, expectedVersion }) => {
    setState('saving')
    setError('')
    try {
      const result = await prepareMealSubstitution({ date, mealType, mealId, expectedVersion })
      setState('ready')
      return result.proposal
    } catch (requestError) {
      setError(requestError.message || 'Could not prepare this meal replacement.')
      setState('error')
      throw requestError
    }
  }, [])

  const applyReplacement = useCallback(async proposalId => {
    setState('saving')
    setError('')
    try {
      const result = await executeMealSubstitution(proposalId)
      await reload()
      return result.audit
    } catch (requestError) {
      setError(requestError.message || 'Could not apply this meal replacement.')
      setState('error')
      throw requestError
    }
  }, [reload])

  return { data, state, error, reload, prepareReplacement, applyReplacement }
}
