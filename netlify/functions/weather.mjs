import householdAuth from './household-auth.js'
import { fetchWeatherForecast } from '../lib/weather-forecast.mjs'
import {getStore} from '@netlify/blobs'

const {readSession}=householdAuth
const FRESH_MS=15*60*1000
const HOUSEHOLD_ID=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
const store=()=>getStore({name:'brevity-household',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
const cacheKey=date=>`${HOUSEHOLD_ID}/weather/${date}`
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'},body:JSON.stringify(body)})

export const handler=async event=>{
  if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed.'})
  const session=await readSession(event).catch(()=>null)
  if(!session)return json(401,{error:'Sign in to view household weather.'})
  const date=event.queryStringParameters?.date||''
  const cached=await store().get(cacheKey(date),{type:'json'}).catch(()=>null)
  if(cached&&Date.now()-new Date(cached.updatedAt).getTime()<FRESH_MS)return json(200,cached)
  try{
    const value=await fetchWeatherForecast(date)
    await store().setJSON(cacheKey(date),value)
    return json(200,value)
  }catch(error){
    console.error('[weather]',error)
    if(cached)return json(200,{...cached,stale:true,refreshError:'Weather refresh is delayed; showing the last successful forecast.'})
    return json(503,{error:error.message||'Weather is temporarily unavailable.'})
  }
}

export const config={path:'/.netlify/functions/weather'}
