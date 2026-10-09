import {householdClock} from '../../src/household/dailyRhythm.js'
import '../lib/native-runtime.mjs'
import {productionEnhancements} from '../lib/enhancement-requests.mjs'
import {dispatchEnhancementNotifications} from '../lib/enhancement-notifications.mjs'
import {reminderStore,reminderRoot,vapidKeys,deliverReminder,inQuietHours} from '../lib/personal-reminders.mjs'
export default async function handler(){
 const store=reminderStore(),root=reminderRoot(),devices=[]
 for await(const page of store.list({prefix:root+'devices/',paginate:true}))devices.push(...await Promise.all(page.blobs.map(blob=>store.get(blob.key,{type:'json'}))))
 if(!devices.filter(Boolean).length)return
 return dispatchEnhancementNotifications({rows:await productionEnhancements().rows(),devices:devices.filter(device=>device&&!inQuietHours(device.preferences||{},householdClock(new Date()).minute)),store,root,keys:await vapidKeys(store),deliver:deliverReminder,inQuietHours})
}
export const config={schedule:'*/5 * * * *'}
