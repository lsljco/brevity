import householdAuth from './household-auth.js'
import {getHealthAlerts,refreshHealthAlerts} from '../lib/health-alert-monitor.mjs'
const {readSession}=householdAuth
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'},body:JSON.stringify(body)})
export const handler=async event=>{if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed.'});const session=await readSession(event).catch(()=>null);if(!session)return json(401,{error:'Sign in to view household health alerts.'});try{let record=await getHealthAlerts();const stale=!record?.checkedAt||Date.now()-new Date(record.checkedAt).getTime()>26*60*60*1000;if(stale)record=await refreshHealthAlerts();return json(200,record)}catch(error){console.error('[health-alerts]',error);const prior=await getHealthAlerts();return prior?json(200,{...prior,refreshError:'Today’s source refresh is delayed; showing the last successful check.'}):json(503,{error:'Public-health monitoring is temporarily unavailable.'})}}
export const config={path:'/.netlify/functions/health-alerts'}
