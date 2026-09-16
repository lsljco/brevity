import householdAuth from './household-auth.js'
import { getOneDriveRepositoryState, oneDriveConfigured } from '../lib/onedrive.mjs'
const {readSession}=householdAuth
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})
export default async function handler(request){const session=await readSession({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null);if(!session)return json(401,{error:'Sign in to view OneDrive status.'});const repository=await getOneDriveRepositoryState();const connection=repository.connection;return json(200,{configured:oneDriveConfigured(),connected:Boolean(connection),changeRequired:repository.changeRequired,targetFolderUrl:repository.targetFolderUrl,connection:connection?{folderName:connection.folderName,folderWebUrl:connection.folderWebUrl,account:connection.account,connectedAt:connection.connectedAt}:null})}
export const config={path:'/.netlify/functions/onedrive-status'}
