import {useEffect,useRef,useState} from 'react'
export default function MealImageBatch({onChanged}){
 const [status,setStatus]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const changed=useRef(onChanged),completed=useRef(null)
 changed.current=onChanged
 useEffect(()=>{
  let live=true
  const load=async()=>{try{const response=await fetch('/.netlify/functions/meal-library-images',{credentials:'include',cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error||'Image rendering status is unavailable.');if(!live)return;setStatus(result);setError('');if(completed.current!==null&&completed.current!==result.completed)changed.current?.();completed.current=result.completed}catch(cause){if(live)setError(cause.message)}}
  load();const interval=setInterval(load,15000);return()=>{live=false;clearInterval(interval)}
 },[])
 const start=async()=>{setBusy(true);setError('');try{const response=await fetch('/.netlify/functions/meal-library-images',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:'{}'});const result=await response.json();if(!response.ok)throw Error(result.error||'Could not start rendering.');setStatus(result)}catch(cause){setError(cause.message)}finally{setBusy(false)}}
 return <section className="meal-image-batch" aria-label="Brevity meal photography"><strong>Brevity meal photography</strong><p>Render imported and uploaded photos in Brevity’s food photography style. Original photos stay visible until their replacements are ready.</p>{status&&<p role="status">{status.completed} of {status.total} items have Brevity images · {status.remaining} remaining{status.active?' · Rendering in the background. You can leave this page.':status.requested&&!status.remaining?' · Complete. Future imports will render automatically.':''}</p>}{(!status||status.remaining>0)&&<button disabled={busy||status?.active} onClick={start}>{busy?'Starting…':status?.active?'Rendering images…':status?.failed?.length?'Retry remaining images':'Render non-Brevity images'}</button>}{status?.failed?.length>0&&<details><summary>{status.failed.length} images need retry</summary>{status.failed.map(meal=><p key={meal.id}>{meal.name}: {meal.error}</p>)}</details>}{error&&<p role="alert">{error}</p>}</section>
}
