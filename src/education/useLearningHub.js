import {useCallback,useEffect,useState} from 'react'
import {ACTION_COMPLETED_EVENT} from '../assistant/actionEvents.js'
export function useLearningHub(enabled=true){
 const [revision,setRevision]=useState(0),[state,setState]=useState({items:[],loading:true,version:null})
 const reload=useCallback(()=>setRevision(n=>n+1),[])
 useEffect(()=>{if(!enabled)return;let active=true;setState({items:[],loading:true,version:null});fetch('/.netlify/functions/learning-hub',{credentials:'include'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load learning records.');if(!Array.isArray(data.items)||!Number.isInteger(data.version))throw Error('Learning records could not be verified. Please retry.');if(active)setState({...data,loading:false})}).catch(error=>{if(active)setState({items:[],version:null,error:error.message,loading:false})});return()=>{active=false}},[revision,enabled])
 useEffect(()=>{const refresh=e=>{if(e.detail?.audit?.operations?.some(op=>op.type.startsWith('education.hub.')))reload()};window.addEventListener(ACTION_COMPLETED_EVENT,refresh);return()=>window.removeEventListener(ACTION_COMPLETED_EVENT,refresh)},[reload])
 return {...state,reload}
}
