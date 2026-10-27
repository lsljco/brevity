import {useEffect,useState} from 'react'
import {needsProjectImage,projectImageSourceKey} from './projectImageModel.js'
import {ensureProjectImage,projectImageState,PROJECT_IMAGE_EVENT} from './projectImageApi.js'

export function useProjectImages(items,canGenerate){
 const [states,setStates]=useState({})
 const signature=JSON.stringify(items.filter(needsProjectImage).map(item=>[item.id,projectImageSourceKey(item)]))
 useEffect(()=>{
  const receive=event=>setStates(previous=>({...previous,[event.detail.id]:event.detail.status}))
  window.addEventListener(PROJECT_IMAGE_EVENT,receive)
  return()=>window.removeEventListener(PROJECT_IMAGE_EVENT,receive)
 },[])
 useEffect(()=>{
  const ids=JSON.parse(signature).map(([id])=>id)
  setStates(previous=>({...previous,...Object.fromEntries(ids.map(id=>[id,projectImageState(id)]))}))
  ids.forEach(id=>{ensureProjectImage(id,{canGenerate}).catch(()=>undefined)})
 },[signature,canGenerate])
 return{states,retry:id=>ensureProjectImage(id,{canGenerate,retry:true})}
}
