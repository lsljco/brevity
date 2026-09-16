export async function fetchDailyWeather(date,{signal}={}){
  const response=await fetch(`/.netlify/functions/weather?date=${encodeURIComponent(date)}`,{credentials:'include',signal})
  const body=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(body.error||'Weather is temporarily unavailable.')
  if(!body?.location?.name||!body?.day||!Array.isArray(body?.periods))throw new Error('Weather returned an incomplete forecast. Brevity will retry.')
  return body
}
