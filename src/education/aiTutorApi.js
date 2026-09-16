async function postJson(path,payload){
  const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify(payload)})
  const data=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(data.error||'Education AI request failed.')
  return data
}

export const generateAiReadingExercise=payload=>postJson('/.netlify/functions/education-ai-exercise',payload)
export const gradeAiExercise=payload=>postJson('/.netlify/functions/education-ai-grade',payload)
export const gradeDirections=payload=>postJson('/.netlify/functions/education-ai-grade',{...payload,mode:'directions'})
export const gradeReadingAudio=payload=>postJson('/.netlify/functions/education-reading-grade',payload)
export const readDirectionsAloud=payload=>postJson('/.netlify/functions/education-directions-speech',payload)
