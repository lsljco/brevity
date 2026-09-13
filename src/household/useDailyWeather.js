import { useCallback, useEffect, useState } from 'react'
import { fetchDailyWeather } from './weatherApi.js'

export function useDailyWeather(date){
  const [state,setState]=useState({status:'loading',data:null,error:''})
  const load=useCallback(async signal=>{
    setState(current=>({status:'loading',data:current.data,error:''}))
    try{const data=await fetchDailyWeather(date,{signal});setState({status:data.stale?'stale':'ready',data,error:data.refreshError||''})}
    catch(error){if(error?.name!=='AbortError')setState(current=>({status:'error',data:current.data,error:error?.message||'Weather is temporarily unavailable.'}))}
  },[date])
  useEffect(()=>{const controller=new AbortController();load(controller.signal);return()=>controller.abort()},[load])
  return {...state,reload:()=>load()}
}
