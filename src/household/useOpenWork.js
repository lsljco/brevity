import {useEffect,useState} from 'react'
import {ACTION_COMPLETED_EVENT} from '../assistant/actionEvents.js'
import {SHARED_STATE_EVENT} from './sharedState.js'
export function useOpenWork(date){
 const [state,setState]=useState({items:[],loading:true,error:''})
 useEffect(()=>{
  let active=true,sequence=0
  const refresh=async()=>{const request=++sequence;try{const response=await fetch(`/.netlify/functions/open-work?date=${date}`,{credentials:'same-origin'}),data=await response.json();if(!response.ok)throw Error(data.error||'Saved work is unavailable.');if(active&&sequence===request)setState({items:data.items||[],loading:false,error:''})}catch(error){if(active&&sequence===request)setState({items:[],loading:false,error:error.message})}}
  setState({items:[],loading:true,error:''});refresh()
  const events=[ACTION_COMPLETED_EVENT,SHARED_STATE_EVENT,'brevity-app-refreshed'];events.forEach(event=>window.addEventListener(event,refresh))
  return()=>{active=false;events.forEach(event=>window.removeEventListener(event,refresh))}
 },[date])
 return state
}
