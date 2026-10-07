import {useState} from 'react'
export default function PersonalReminders({currentMember}){
 const [status,setStatus]=useState(''),[busy,setBusy]=useState(false),[lead,setLead]=useState(15),[quiet,setQuiet]=useState(true),[start,setStart]=useState('20:00'),[end,setEnd]=useState('04:00')
 const run=async action=>{
  setBusy(true);setStatus('')
  try{
   if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('On iPhone, add Brevity to your Home Screen, open it there, then enable reminders.')
   if(action==='enable'&&await Notification.requestPermission()!=='granted')throw Error('Allow notifications for Brevity in your iPhone settings, then try again.')
   const registration=await navigator.serviceWorker.register('/brevity-notifications-sw.js')
   await navigator.serviceWorker.ready
   let subscription=await registration.pushManager.getSubscription()
   const response=await fetch('/.netlify/functions/personal-reminders',{credentials:'include'}),config=await response.json()
   if(!response.ok||config.member!==currentMember)throw Error(config.error||'Reload Brevity to verify your account.')
   if(action==='enable'&&!subscription){const raw=atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/'));subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))})}
   if(!subscription)throw Error('Enable reminders on this device first.')
   const saved=await fetch('/.netlify/functions/personal-reminders',{method:action==='disable'?'DELETE':'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({action,member:currentMember,subscription,preferences:{leadMinutes:lead,quietEnabled:quiet,quietStart:start,quietEnd:end}})})
   const result=await saved.json();if(!saved.ok)throw Error(result.error)
   if(action==='disable')await subscription.unsubscribe()
   setStatus(action==='test'?'Test sent. Check your notifications.':action==='disable'?'Reminders disabled on this device.':`Reminders enabled for ${currentMember} on this device.`)
  }catch(error){setStatus(error.message)}finally{setBusy(false)}
 }
 return <details className="personal-reminders"><summary>iPhone & device reminders</summary><p>Add Brevity to your iPhone Home Screen and open it there. Enable reminders separately on each person’s device. Alerts use saved responsibilities and named gym participants; no calendar events are added.</p><label>Remind me <select value={lead} onChange={e=>setLead(Number(e.target.value))}>{[0,5,10,15,30].map(n=><option key={n} value={n}>{n?n+' minutes before':'At the start'}</option>)}</select></label><label><input type="checkbox" checked={quiet} onChange={e=>setQuiet(e.target.checked)}/> Quiet hours</label>{quiet&&<div><label>From <input type="time" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Until <input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>}<div><button disabled={busy} onClick={()=>run('enable')}>Enable / save reminders</button><button disabled={busy} onClick={()=>run('test')}>Send test to this device</button><button disabled={busy} onClick={()=>run('disable')}>Disable on this device</button></div>{status&&<p role="status">{status}</p>}<p>Focus settings and connectivity can delay delivery. No alert is sent for an item without an exact start time.</p></details>
}
