import {withLambda} from '@netlify/aws-lambda-compat'
import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {lookupPackagedFood} from '../lib/packaged-food-lookup.mjs'
const headers={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}
const json=(statusCode,body)=>({statusCode,headers,body:JSON.stringify(body)})
export const lambdaHandler=async event=>{
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
  try{
    if(!await householdAuth.readSession(event))return json(401,{error:'Sign in to look up packaged foods.'})
    return json(200,{product:await lookupPackagedFood(JSON.parse(event.body||'{}').barcode)})
  }catch(error){return json(error.status||(error instanceof SyntaxError?400:502),{error:error.name==='TimeoutError'?'Product lookup timed out. Enter the package label manually.':error.message||'Product lookup failed.'})}
}
export const config={path:'/.netlify/functions/packaged-food-lookup'}
export default withLambda(lambdaHandler)
