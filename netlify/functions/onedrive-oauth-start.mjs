import householdAuth from './household-auth.js'
import { createOneDriveAuthorization } from '../lib/onedrive.mjs'
const {readSession}=householdAuth
export default async function handler(request){const session=await readSession({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null);if(!session)return new Response('Sign in to connect OneDrive.',{status:401});try{return Response.redirect(await createOneDriveAuthorization(),302)}catch(error){return new Response(error.message||'Could not start OneDrive connection.',{status:500})}}
export const config={path:'/.netlify/functions/onedrive-oauth-start'}
