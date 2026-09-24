import householdAuth from './household-auth.js'
import {analyzeMealImage} from '../lib/meal-image-import.mjs'

const headers={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'POST,OPTIONS'}
const json=(statusCode,body)=>({statusCode,headers,body:JSON.stringify(body)})
export const handler=async event=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers,body:''}
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  try{
    const session=await householdAuth.readSession(event)
    if(!session)return json(401,{error:'Sign in to import meals.'})
    return json(200,await analyzeMealImage(JSON.parse(event.body||'{}')))
  }catch(error){console.error('[meal-image-import]',error);return json(Number(error.status)|| (error instanceof SyntaxError?400:500),{error:error.message||'Meal image import failed.'})}
}
export const config={path:'/.netlify/functions/meal-image-import'}
