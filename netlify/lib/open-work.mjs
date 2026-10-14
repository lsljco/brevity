import {getStore} from './scoped-store.mjs'
import {openWorkForDate} from '../../src/household/openWork.js'
export async function readOpenWork(date,{plans,shared,householdId=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'}={}){
 const root=householdId+'/',prefix=root+'daily-plans/',keys=[]
 let cursor
 do{const page=await plans.list({prefix,...(cursor?{cursor}:{})});keys.push(...page.blobs.map(x=>x.key).filter(key=>/^\d{4}-\d{2}-\d{2}$/.test(key.slice(prefix.length))&&key.slice(prefix.length)<=date));cursor=page.cursor}while(cursor)
 const records=[]
 // Read every saved date, in bounded batches: old unfinished work never ages out.
 for(let i=0;i<keys.length;i+=16)records.push(...await Promise.all(keys.slice(i,i+16).map(key=>plans.get(key,{type:'json'}))))
 const projectRecord=await shared.get(root+'records/homehq_items_v1',{type:'json'})
 const projects=typeof projectRecord?.value==='string'?JSON.parse(projectRecord.value):projectRecord?.value
 return openWorkForDate({plans:records.filter(Boolean),projects,projectVersion:Number(projectRecord?.version||0),date})
}
export function loadOpenWork(date){
 const options={consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN}
 return readOpenWork(date,{plans:getStore({name:'brevity-household',...options}),shared:getStore({name:'brevity-household-state',...options})})
}
