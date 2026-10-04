import {getStore} from './scoped-store.mjs'
export const nutritionJobId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{16,100}$/.test(value)?value:null
export const nutritionJobKey=(member,id)=>`${process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'}/${encodeURIComponent(member)}/${id}`
export const nutritionJobStore=()=>getStore({name:'brevity-nutrition-jobs',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
export const jobJson=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}})
