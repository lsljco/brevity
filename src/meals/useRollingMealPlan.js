import { useCallback, useEffect, useRef, useState } from 'react'
import { ACTION_COMPLETED_EVENT } from '../assistant/actionEvents.js'
import { getHouseholdDateKey } from '../finance/financeTime.js'
import { createMealLibraryItem, executeMealSubstitution, fetchRollingMealPlan, prepareMealSubstitution } from './mealPlanApi.js'

export const ROLLING_MEAL_APP_REFRESH_EVENT = 'brevity-app-refreshed'

export const rollingMealPlanRequestKey = startDate => String(startDate || '__current-window__')
export const rollingMealPlanScopeIsCurrent = (scope,requestKey) => Boolean(scope?.enabled&&scope.requestKey===requestKey)
export const rollingMealPlanOperationIsCurrent = ({operation,currentOperation,mounted,scope,requestKey}) => Boolean(
  operation===currentOperation&&mounted&&rollingMealPlanScopeIsCurrent(scope,requestKey)
)
const staleMealPlanScopeError = () => Object.assign(new Error('The meal-plan date changed. Reopen this meal before continuing.'),{code:'STALE_MEAL_SCOPE'})
export const captureMealPlanRefreshError = async reload => {
  try{await reload?.({supersede:true});return null}
  catch(error){return error}
}

export function rollingMealPlanView({ enabled = true, startDate, requireFresh = false, state = 'loading', stateRequestKey = '', data = null, dataRequestKey = '', error = '' } = {}) {
  const requestKey=rollingMealPlanRequestKey(startDate)
  const visibleState=enabled?(stateRequestKey===requestKey?state:'loading'):'idle'
  const visibleData=enabled&&dataRequestKey===requestKey&&(!requireFresh||visibleState==='ready')?data:null
  const visibleError=visibleState==='error'&&stateRequestKey===requestKey?error:''
  return {data:visibleData,state:visibleState,error:visibleError,requestKey}
}

export function shouldReloadRollingMealPlan(event) {
  if(event?.type===ROLLING_MEAL_APP_REFRESH_EVENT)return true
  if(event?.type!==ACTION_COMPLETED_EVENT)return false
  return (event?.detail?.audit?.operations || []).some(operation=>operation?.type==='meal.substitute')
}

export function validateRollingMealPlan(result,startDate) {
  if(!startDate)return result
  const requested=String(startDate)
  const requestedDay=result?.days?.find(day=>day?.date===requested)
  if(result?.startDate!==requested||!requestedDay){
    throw new Error(`The rolling meal plan did not return the requested day (${requested}).`)
  }
  const missingMeals=['breakfast','lunch','dinner'].filter(mealType=>!requestedDay.resolvedMeals?.[mealType]?.name)
  if(missingMeals.length)throw new Error(`The rolling meal plan for ${requested} is incomplete (${missingMeals.join(', ')} missing).`)
  return result
}

export function useRollingMealPlan({ enabled = true, startDate, requireFresh = false, reloadOnRefreshEvents = false } = {}) {
  const [currentWindowStart,setCurrentWindowStart]=useState(()=>getHouseholdDateKey())
  const [data, setData] = useState(null)
  const [dataRequestKey, setDataRequestKey] = useState('')
  const [state, setState] = useState('loading')
  const [stateRequestKey, setStateRequestKey] = useState('')
  const [error, setError] = useState('')
  const requestRef = useRef(0)
  const activeRequestRef = useRef(null)
  const mountedRef=useRef(true)
  const scopeRef=useRef(null)
  const reloadRef=useRef(null)
  const effectiveStartDate=startDate||currentWindowStart
  const requestKey=rollingMealPlanRequestKey(effectiveStartDate)
  scopeRef.current={enabled,requestKey}

  const reload = useCallback(({ supersede = false } = {}) => {
    if (!mountedRef.current||!enabled||!rollingMealPlanScopeIsCurrent(scopeRef.current,requestKey)) return null
    if(!supersede&&activeRequestRef.current?.requestKey===requestKey)return activeRequestRef.current.promise
    const request = ++requestRef.current
    setStateRequestKey(requestKey)
    setState('loading')
    setError('')
    if(requireFresh){setData(null);setDataRequestKey('')}
    let pendingRequest
    pendingRequest=(async()=>{
      try {
        const result=validateRollingMealPlan(await fetchRollingMealPlan(effectiveStartDate),effectiveStartDate)
        if(request!==requestRef.current)return null
        setData(result)
        setDataRequestKey(requestKey)
        setState('ready')
        return result
      } catch (requestError) {
        if(request!==requestRef.current)return null
        if(requireFresh){setData(null);setDataRequestKey('')}
        setError(requestError.message || 'Could not load the household meal plan.')
        setState('error')
        throw requestError
      } finally {
        if(activeRequestRef.current?.promise===pendingRequest)activeRequestRef.current=null
      }
    })()
    activeRequestRef.current={requestKey,promise:pendingRequest}
    return pendingRequest
  }, [effectiveStartDate, enabled, requestKey, requireFresh])
  reloadRef.current=reload

  useEffect(()=>{
    mountedRef.current=true
    return()=>{mountedRef.current=false}
  },[])

  useEffect(()=>{
    if(startDate)return
    const updateWindow=()=>setCurrentWindowStart(current=>{const next=getHouseholdDateKey();return next===current?current:next})
    updateWindow()
    const timer=setInterval(updateWindow,60_000)
    return()=>clearInterval(timer)
  },[startDate])

  useEffect(() => {
    if (!enabled) {
      requestRef.current += 1
      activeRequestRef.current=null
      setStateRequestKey('')
      setState('idle')
      setError('')
      if(requireFresh){setData(null);setDataRequestKey('')}
      return
    }
    reload().catch(() => undefined)
    return () => { requestRef.current += 1; activeRequestRef.current=null }
  }, [enabled, reload, requireFresh])

  useEffect(()=>{
    if(!enabled||!reloadOnRefreshEvents||typeof window==='undefined')return
    const refresh=event=>{if(shouldReloadRollingMealPlan(event))reload({supersede:event?.type===ROLLING_MEAL_APP_REFRESH_EVENT})?.catch?.(()=>undefined)}
    window.addEventListener(ROLLING_MEAL_APP_REFRESH_EVENT,refresh)
    window.addEventListener(ACTION_COMPLETED_EVENT,refresh)
    return()=>{
      window.removeEventListener(ROLLING_MEAL_APP_REFRESH_EVENT,refresh)
      window.removeEventListener(ACTION_COMPLETED_EVENT,refresh)
    }
  },[enabled,reload,reloadOnRefreshEvents])

  const addMeal = useCallback(async meal => {
    if(!mountedRef.current||!rollingMealPlanScopeIsCurrent(scopeRef.current,requestKey))throw staleMealPlanScopeError()
    const operation=++requestRef.current
    activeRequestRef.current=null
    setStateRequestKey(requestKey)
    setState('saving')
    setError('')
    try {
      const result=await createMealLibraryItem(meal)
      if(!rollingMealPlanOperationIsCurrent({operation,currentOperation:requestRef.current,mounted:mountedRef.current,scope:scopeRef.current,requestKey}))throw staleMealPlanScopeError()
      await reloadRef.current?.({supersede:true})
      return result.meal
    } catch (requestError) {
      if(operation===requestRef.current&&mountedRef.current&&scopeRef.current?.enabled&&scopeRef.current.requestKey===requestKey){
        setError(requestError.message || 'Could not add this meal to the household library.')
        setState('error')
      }
      throw requestError
    }
  }, [requestKey])

  const prepareReplacement = useCallback(async ({ date, mealType, mealId, expectedVersion }) => {
    if(!mountedRef.current||!rollingMealPlanScopeIsCurrent(scopeRef.current,requestKey))throw staleMealPlanScopeError()
    const operation=++requestRef.current
    activeRequestRef.current=null
    setStateRequestKey(requestKey)
    setState('saving')
    setError('')
    try {
      const result = await prepareMealSubstitution({ date, mealType, mealId, expectedVersion })
      if(!rollingMealPlanOperationIsCurrent({operation,currentOperation:requestRef.current,mounted:mountedRef.current,scope:scopeRef.current,requestKey}))throw staleMealPlanScopeError()
      setState('ready')
      return result.proposal
    } catch (requestError) {
      if(operation===requestRef.current&&mountedRef.current&&scopeRef.current?.enabled&&scopeRef.current.requestKey===requestKey){
        setError(requestError.message || 'Could not prepare this meal replacement.')
        setState('error')
      }
      throw requestError
    }
  }, [requestKey])

  const applyReplacement = useCallback(async proposalId => {
    if(!mountedRef.current||!rollingMealPlanScopeIsCurrent(scopeRef.current,requestKey))throw staleMealPlanScopeError()
    const operation=++requestRef.current
    activeRequestRef.current=null
    setStateRequestKey(requestKey)
    setState('saving')
    setError('')
    try {
      const result = await executeMealSubstitution(proposalId)
      const scopeChangedBeforeRefresh=!mountedRef.current||!rollingMealPlanScopeIsCurrent(scopeRef.current,requestKey)
      const refreshError=mountedRef.current?await captureMealPlanRefreshError(reloadRef.current):null
      const scopeChanged=scopeChangedBeforeRefresh||!mountedRef.current||!rollingMealPlanScopeIsCurrent(scopeRef.current,requestKey)
      return {audit:result.audit,refreshError,scopeChanged}
    } catch (requestError) {
      if(operation===requestRef.current&&mountedRef.current&&scopeRef.current?.enabled&&scopeRef.current.requestKey===requestKey){
        setError(requestError.message || 'Could not apply this meal replacement.')
        setState('error')
      }
      throw requestError
    }
  }, [requestKey])

  const view=rollingMealPlanView({enabled,startDate:effectiveStartDate,requireFresh,state,stateRequestKey,data,dataRequestKey,error})
  return { ...view, reload, addMeal, prepareReplacement, applyReplacement }
}
