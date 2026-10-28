import '../lib/native-runtime.mjs'
import auth from '../lib/household-auth.cjs'
import {bankStore,bankHousehold} from '../lib/bank-background-sync.mjs'
export default async request=>{
 if(request.method!=='GET')return new Response('Method not allowed',{status:405})
 if(!await auth.readSession({headers:{cookie:request.headers.get('cookie')||''}}))return new Response('Unauthorized',{status:401})
 const data=await bankStore('brevity-bank-sync').get(bankHousehold(),{type:'json'})
 return Response.json(data||{state:'pending',connections:[]},{headers:{'cache-control':'private, no-store'}})
}
