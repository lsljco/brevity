import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'
import { FITNESS_IMAGE_STORE, FITNESS_MEMBERS, FITNESS_EXERCISES, fitnessImageKey } from '../lib/fitness-image.mjs'

const {readSession}=householdAuth
const safe=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80)

export default async function handler(request){
  const session=await readSession({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
  if(!session)return new Response('Sign in to access household workout images.',{status:401})
  const url=new URL(request.url),member=url.searchParams.get('member'),exerciseId=safe(url.searchParams.get('exerciseId'))
  if(!FITNESS_MEMBERS.includes(member)||!FITNESS_EXERCISES[exerciseId])return new Response('A valid member and exercise are required.',{status:400})
  const store=getStore({name:FITNESS_IMAGE_STORE,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
  const bytes=await store.get(fitnessImageKey(process.env.BREVITY_HOUSEHOLD_ID||'lslj-family',member,exerciseId),{type:'arrayBuffer'}).catch(()=>null)
  if(!bytes)return new Response('Workout image not found.',{status:404})
  return new Response(bytes,{headers:{'content-type':'image/png','cache-control':'private, max-age=86400'}})
}

export const config={path:'/.netlify/functions/fitness-images'}
