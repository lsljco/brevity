import householdAuth from './household-auth.js'
import {readSermonWorkflow} from '../lib/sermon-workflow-state.mjs'
const {readSession}=householdAuth
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)})
export const handler=async event=>{
 if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed.'})
 const session=await readSession(event).catch(()=>null);if(!session)return json(401,{error:'Sign in to view sermon workflow status.'})
 const id=String(event.queryStringParameters?.id||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,120);if(!id)return json(400,{error:'A sermon workflow id is required.'})
 const workflow=await readSermonWorkflow(id);if(!workflow)return json(404,{error:'Sermon workflow not found.'})
 return json(200,{workflow})
}
