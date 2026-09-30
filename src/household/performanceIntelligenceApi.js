export async function classifyCalendarActivities({events,pillars}){
  const response=await fetch('/.netlify/functions/calendar-pillar-classify',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({events,pillars})})
  const payload=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(payload.error||`Calendar classification failed (${response.status}).`)
  return payload
}

export async function fetchPerformanceEvidence(from,to,{signal}={}){
  const response=await fetch(`/.netlify/functions/household-performance-evidence?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,{credentials:'include',signal})
  const body=await response.json().catch(()=>({}))
  if(!response.ok)throw Error(body.error||'Performance evidence could not be loaded.')
  if(!Array.isArray(body.dailyPlans)||!Array.isArray(body.reportedActivities)||!Array.isArray(body.unavailable))throw Error('Performance evidence response is incomplete.')
  return body
}
