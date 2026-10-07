import '../lib/native-runtime.mjs'
import householdAuth from '../lib/household-auth.cjs'
import {reminderStore,reminderRoot,vapidKeys,deviceId,validSubscription,reminderPreferences,deliverReminder} from '../lib/personal-reminders.mjs'
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}})
export function createPersonalReminderHandler({authenticate=householdAuth.readSession,storeFactory=reminderStore,deliver=deliverReminder}={}){return async function handler(request){
 const session=await authenticate({headers:{cookie:request.headers.get('cookie')||''}}).catch(()=>null)
 if(!session)return json(401,{error:'Sign in to manage your reminders.'})
 if(!['GET','POST','DELETE'].includes(request.method))return json(405,{error:'Method not allowed.'})
 try{
  const store=storeFactory(),keys=await vapidKeys(store)
  if(request.method==='GET')return json(200,{member:session.member,publicKey:keys.publicKey})
  const body=await request.json().catch(()=>({}))
  if(body.member!==session.member)return json(409,{error:'The signed-in member changed. Reload before enabling reminders.'})
  if(!validSubscription(body.subscription))return json(400,{error:'A supported device subscription is required.'})
  const id=deviceId(body.subscription.endpoint),key=`${reminderRoot()}devices/${id}`,existing=await store.get(key,{type:'json'})
  if(request.method==='DELETE'){
   if(existing?.member===session.member)await store.delete(key)
   return json(200,{enabled:false})
  }
  if(body.action==='test'){
   if(existing?.member!==session.member)return json(403,{error:'Enable reminders on this device first.'})
   if(existing.testAt&&Date.now()-Date.parse(existing.testAt)<30000)return json(429,{error:'Wait 30 seconds before another test.'})
   await store.setJSON(key,{...existing,testAt:new Date().toISOString()})
   await deliver(existing.subscription,{title:'Brevity reminders are ready',body:`${session.member}, this device can receive your daily reminders.`,url:'/?reminder=1#daily-rhythm',tag:'brevity-test'},keys)
   return json(200,{sent:true})
  }
  const preferences=reminderPreferences(body.preferences)
  await store.setJSON(key,{id,member:session.member,subscription:body.subscription,preferences,updatedAt:new Date().toISOString()})
  return json(200,{enabled:true,preferences})
 }catch{return json(503,{error:'Brevity could not save or send this reminder. Please retry.'})}
}

}
export default createPersonalReminderHandler()
