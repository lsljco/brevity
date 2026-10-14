import '../lib/native-runtime.mjs'
import {createProductionActionResources} from '../lib/assistant-action-executor.mjs'
import {CHORE_RESOURCE,PROJECT_RESOURCE} from '../../src/notifications/completionSignoffs.js'
import {dispatchSignoffNotifications} from '../lib/completion-signoff-notifications.mjs'
import {reminderStore,reminderRoot,vapidKeys,deliverReminder} from '../lib/personal-reminders.mjs'
export default async function handler(){
 const store=reminderStore(),root=reminderRoot(),devices=[]
 for await(const page of store.list({prefix:root+'devices/',paginate:true}))devices.push(...await Promise.all(page.blobs.map(blob=>store.get(blob.key,{type:'json'}))))
 if(!devices.some(device=>device&&['Larry','Terica'].includes(device.member)))return
 const resources=createProductionActionResources(),records=await Promise.allSettled([resources.read(CHORE_RESOURCE),resources.read(PROJECT_RESOURCE)])
 return dispatchSignoffNotifications({chores:records[0].status==='fulfilled'?records[0].value:null,projects:records[1].status==='fulfilled'?records[1].value:null,devices,store,root,keys:await vapidKeys(store),deliver:deliverReminder})
}
export const config={schedule:'* * * * *'}
