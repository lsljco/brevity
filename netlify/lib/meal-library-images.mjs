import {randomUUID} from 'node:crypto'
import {isBrevityMealImage} from '../../src/meals/mealImageStyle.js'
import {generateMealImage} from './meal-image.mjs'
export const BATCH_STORE='brevity-meal-image-batches'
export function createLibraryImageBatch({store,repository,imageStore,householdId='lslj-family',generateImage=generateMealImage,now=()=>new Date()}){
 const key=`${householdId}/library-restyle`
 const read=()=>store.getWithMetadata(key,{type:'json'})
 const status=async()=>{
  const [entry,{library}]=await Promise.all([read(),repository.getLibrary()])
  const remaining=library.filter(meal=>!isBrevityMealImage(meal))
  const failures=entry?.data?.failures||{}
  return {requested:Boolean(entry?.data),active:Boolean(entry?.data?.enabled&&remaining.some(meal=>(failures[meal.id]?.attempts||0)<3)),total:library.length,remaining:remaining.length,completed:library.length-remaining.length,failed:remaining.filter(meal=>(failures[meal.id]?.attempts||0)>=3).map(meal=>({id:meal.id,name:meal.name,error:failures[meal.id].error})),updatedAt:entry?.data?.updatedAt}
 }
 const start=async actor=>{
  for(let attempt=0;attempt<3;attempt++){
   const entry=await read()
   if(entry?.data?.enabled&&Date.parse(entry.data.leaseUntil)>now().getTime())return status()
   const stamp=now().toISOString(),data={enabled:true,requestedAt:stamp,updatedAt:stamp,actor,failures:{},nextRunAt:entry?.data?.nextRunAt||null}
   const result=await store.setJSON(key,data,entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true})
   if(result?.modified!==false)return status()
  }
  throw Error('Image rendering was updated on another device. Refresh and try again.')
 }
 const run=async()=>{
  const entry=await read(),stamp=now()
  if(!entry?.data?.enabled||Date.parse(entry.data.leaseUntil)>stamp.getTime()||Date.parse(entry.data.nextRunAt)>stamp.getTime())return
  const lease=randomUUID(),claimed={...entry.data,lease,leaseUntil:new Date(stamp.getTime()+14*60_000).toISOString(),updatedAt:stamp.toISOString(),nextRunAt:new Date(stamp.getTime()+120_000).toISOString()}
  if((await store.setJSON(key,claimed,{onlyIfMatch:entry.etag}))?.modified===false)return
  const {library}=await repository.getLibrary(),failures={...claimed.failures}
  const pending=library.filter(meal=>!isBrevityMealImage(meal)&&(failures[meal.id]?.attempts||0)<3).slice(0,4)
  let cursor=0,rateLimited=false
  const work=async()=>{while(cursor<pending.length&&!rateLimited){const meal=pending[cursor++];try{
   const image=await generateImage({meal,assetId:`${meal.id}-${randomUUID()}`,householdId,store:imageStore})
   await repository.setMealImage({mealId:meal.id,image,expectedImage:meal.image,onlyIfNonBrevity:true,actor:claimed.actor||'Brevity'})
   delete failures[meal.id]
  }catch(error){if(error.status===429||/rate limit/i.test(error.message||'')){rateLimited=true;continue}failures[meal.id]={attempts:(failures[meal.id]?.attempts||0)+1,error:error.message||'Image generation failed.'}}}}
  await Promise.all(Array.from({length:Math.min(2,pending.length)},work))
  const latest=await read()
  if(latest?.data?.lease!==lease)return
  await store.setJSON(key,{...latest.data,failures,enabled:true,nextRunAt:new Date(now().getTime()+120_000).toISOString(),lease:null,leaseUntil:null,updatedAt:now().toISOString()},{onlyIfMatch:latest.etag})
 }
 return {status,start,run}
}
