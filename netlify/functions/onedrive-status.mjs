import householdAuth from './household-auth.js'
import { getOneDriveConnection, oneDriveConfigured } from '../lib/onedrive.mjs'
const {readSession}=householdAuth
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})
export default async function handler(request){const session=await readSession({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null);if(!session)return json(401,{error:'Sign in to view OneDrive status.'});const connection=await getOneDriveConnection();return json(200,{configured:oneDriveConfigured(),connected:Boolean(connection),connection:connection?{folderName:connection.folderName,folderWebUrl:connection.folderWebUrl,account:connection.account,connectedAt:connection.connectedAt}:null})}
export const config={path:'/.netlify/functions/onedrive-status'}
