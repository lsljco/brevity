import '../lib/native-runtime.mjs'
import {withLambda} from '@netlify/aws-lambda-compat'
import householdAuth from '../lib/household-auth.cjs'
import {getStore} from '../lib/scoped-store.mjs'
import {productionAssistantActionRepository} from '../lib/assistant-action-repository.mjs'
import {createGroceryRepository} from '../lib/grocery-store.mjs'
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)})
export function createGroceryHandler({readSession=householdAuth.readSession,getPermissions=async()=> (await productionAssistantActionRepository()).getPermissions(),repository=()=>createGroceryRepository({store:getStore({name:'brevity-groceries',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN}),householdId:process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'})}={}){
 return async event=>{
  try{
   const session=await readSession(event)
   if(!session)return json(401,{error:'Sign in to access the household Grocery List.'})
   if(!['GET','POST'].includes(event.httpMethod))return json(405,{error:'Method not allowed.'})
   const canEdit=session.role==='admin'||(await getPermissions())[session.member]?.planning===true
   if(event.httpMethod==='GET')return json(200,{...await repository().read(),canEdit})
   if(!canEdit)return json(403,{error:'Household planning access is required to change the Grocery List.'})
   if((event.body||'').length>500000)return json(413,{error:'Select fewer items at a time.'})
   return json(200,{...await repository().mutate(JSON.parse(event.body||'{}'),session.member),canEdit})
  }catch(error){return json(error.status||(error instanceof SyntaxError?400:500),{error:error.status?error.message:error instanceof SyntaxError?'Invalid grocery request.':'The Grocery List could not be saved or loaded. Please retry.'})}
 }
}
export const lambdaHandler=createGroceryHandler()
export default withLambda(lambdaHandler)
