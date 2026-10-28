import {useEffect,useState} from 'react'
import {FINANCE_REFRESH_EVENT} from './financeRefresh.js'
import {SHARED_STATE_EVENT} from '../household/sharedState.js'
export function bankUpdateSummary(status,sourceUpdatedAt,liveCheckedAt,now=Date.now()){
 const times=[status?.balanceSourceUpdatedAt,sourceUpdatedAt,liveCheckedAt].map(v=>Date.parse(v||'')).filter(t=>Number.isFinite(t)&&t<=now)
 const updatedAt=times.length?Math.max(...times):null
 const failed=status?.state==='partial'||status?.state==='error'
 return{updatedAt,notice:failed?'Automatic update needs attention':status?.state==='disconnected'?'No connected bank':updatedAt&&now-updatedAt>24*60*60_000?'Bank data is over 24 hours old':status?.state==='running'?'Checking available bank data…':status?.state==='synced'?'Automatic sync active':'Automatic sync awaiting confirmation'}
}
export default function BankUpdateStatus({sourceUpdatedAt,liveCheckedAt,formatTime,onDetails}){
 const [status,setStatus]=useState(null)
 useEffect(()=>{
  const controller=new AbortController();let busy=false
  const load=async()=>{if(busy||document.hidden)return;busy=true;try{const r=await fetch('/.netlify/functions/bank-sync-status',{credentials:'include',signal:controller.signal});if(r.ok){const body=await r.json();if(!controller.signal.aborted)setStatus(body)}}catch{/* Retain last observed status. */}finally{busy=false}}
  load();const timer=setInterval(load,120000)
  window.addEventListener(FINANCE_REFRESH_EVENT,load);window.addEventListener(SHARED_STATE_EVENT,load);document.addEventListener('visibilitychange',load)
  return()=>{controller.abort();clearInterval(timer);window.removeEventListener(FINANCE_REFRESH_EVENT,load);window.removeEventListener(SHARED_STATE_EVENT,load);document.removeEventListener('visibilitychange',load)}
 },[])
 const summary=bankUpdateSummary(status,sourceUpdatedAt,liveCheckedAt)
 return <div style={{flex:'1 1 240px',minWidth:0}}><div style={{fontSize:13,color:'#F7F6F2'}}>Bank data updated: {summary.updatedAt?formatTime(summary.updatedAt):'Time unavailable'}</div><button type="button" onClick={onDetails} style={{background:'none',border:0,padding:'5px 0',color:'#C5A46D',fontSize:12,cursor:'pointer',textAlign:'left'}}>{summary.notice}</button>{status?.connections?.some(x=>x.transactionError==='ITEM_LOGIN_REQUIRED'||x.balanceError==='ITEM_LOGIN_REQUIRED')&&<p role="alert">Bank sign-in needs renewal. Open Bank information.</p>}</div>
}
