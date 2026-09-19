import { useEffect, useState } from 'react'
import { memberExerciseImageUrl } from './fitnessImageApi.js'

export default function MemberExerciseImage({member,exercise,className='',loading='lazy',revision=''}){
  const personalized=memberExerciseImageUrl(member,exercise.id,revision),[source,setSource]=useState(personalized)
  useEffect(()=>setSource(personalized),[personalized])
  return <img className={className} src={source} alt={`${member} performing ${exercise.name} with correct form`} loading={loading} onError={()=>{if(source!==exercise.image)setSource(exercise.image)}} />
}
