export async function classifyCalendarActivities({events,pillars}){
  const response=await fetch('/.netlify/functions/calendar-pillar-classify',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({events,pillars})})
  const payload=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(payload.error||`Calendar classification failed (${response.status}).`)
  return payload
}
