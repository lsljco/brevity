import householdAuth from './household-auth.js'
import {calculateMealNutrition} from '../lib/meal-nutrition.mjs'

const {readSession}=householdAuth
const headers={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'POST,OPTIONS'}
const json=(statusCode,body)=>({statusCode,headers,body:JSON.stringify(body)})

export const handler=async event=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers,body:''}
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  try{
    const session=await readSession(event)
    if(!session)return json(401,{error:'Sign in to calculate meal nutrition.'})
    return json(200,{nutrition:await calculateMealNutrition(JSON.parse(event.body||'{}'))})
  }catch(error){
    console.error('[meal-nutrition]',error)
    const status=Number(error.status)||(error.code==='VALIDATION_ERROR'||error instanceof SyntaxError?400:500)
    return json(status,{error:error.message||'Nutrition calculation failed.'})
  }
}

export const config={path:'/.netlify/functions/meal-nutrition'}
