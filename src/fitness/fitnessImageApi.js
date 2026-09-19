const request=async(url,options={})=>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000)
  try{
    const response=await fetch(url,{credentials:'include',...options,signal:controller.signal})
    const body=await response.json().catch(()=>({}))
    if(!response.ok)throw new Error(body.error||`Workout-image request returned ${response.status}.`)
    return body
  }finally{clearTimeout(timeout)}
}

export const memberExerciseImageUrl=(member,exerciseId,version='')=>`/.netlify/functions/fitness-images?member=${encodeURIComponent(member)}&exerciseId=${encodeURIComponent(exerciseId)}${version?`&v=${encodeURIComponent(version)}`:''}`

export async function generateWorkoutImages(member,exerciseIds,onProgress=()=>{}){
  const jobId=globalThis.crypto?.randomUUID?.()||`fitness-image-${Date.now()}-${Math.random().toString(36).slice(2)}`
  await request('/.netlify/functions/fitness-image-generate-background',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobId,member,exerciseIds})})
  const deadline=Date.now()+12*60*1000
  while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,2500))
    const job=await request(`/.netlify/functions/fitness-image-job-status?jobId=${encodeURIComponent(jobId)}`)
    onProgress(job)
    if(job.state==='ready')return job
    if(job.state==='error')throw new Error(job.error||'Brevity could not create the workout images.')
  }
  throw new Error('The workout images are still being created. Refresh Physical Fitness in a few minutes.')
}
