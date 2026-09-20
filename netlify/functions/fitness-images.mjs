import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'
import { FITNESS_IMAGE_STORE, fitnessImageKey } from '../lib/fitness-image.mjs'
const {readSession}=householdAuth,safe=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,180)
export default async function handler(request){const session=await readSession({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null);if(!session)return new Response('Sign in to access household fitness images.',{status:401});const id=safe(new URL(request.url).searchParams.get('id'));if(!id)return new Response('A fitness image id is required.',{status:400});const store=getStore({name:FITNESS_IMAGE_STORE,consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN}),bytes=await store.get(fitnessImageKey(process.env.BREVITY_HOUSEHOLD_ID||'lslj-family',id),{type:'arrayBuffer'}).catch(()=>null);if(!bytes)return new Response('Fitness image not found.',{status:404});return new Response(bytes,{headers:{'content-type':'image/png','cache-control':'private, max-age=86400'}})}
export const config={path:'/.netlify/functions/fitness-images'}
