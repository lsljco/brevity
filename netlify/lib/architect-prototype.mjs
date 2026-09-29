import {createHash} from 'node:crypto'
import build from './release-build-context.mjs'
import {getStore} from './scoped-store.cjs'
const packetFields=['title','problem','requirements','userStories','dataChanges','permissionChanges','testPlan','rolloutPlan','rollbackPlan']
export function approvedPrototypePacket(record){
 if(record?.stage!=='implementation-planned'||!['Larry','Lorenzo'].includes(record.updatedBy))throw Error('Larry or Lorenzo must approve a complete implementation plan before prototype generation.')
 if(packetFields.some(key=>typeof record[key]!=='string'||!record[key].trim()||record[key].length>3000))throw Error('The approved implementation packet is incomplete.')
 return Object.fromEntries(packetFields.map(key=>[key,record[key]]))
}
export async function requestArchitectPrototype({record,member,role,store,token=process.env.BREVITY_ARCHITECT_GITHUB_TOKEN,fetcher=globalThis.fetch,preview=build.preview}){
 if(role!=='admin'||!['Larry','Lorenzo'].includes(member))throw Error('Only Larry or Lorenzo administrators can request prototypes.')
 if(preview)throw Error('Prototype dispatch is disabled in deploy previews.')
 const packet=approvedPrototypePacket(record)
 if(!token)throw Error('The isolated prototype workflow is prepared but not connected. An administrator must configure its scoped GitHub dispatch credential and generation key; no branch or deployment has been created.')
 const id=createHash('sha256').update(JSON.stringify([record.id,record.updatedAt,packet])).digest('hex').slice(0,40),key=`requests/${id}`
 store ||= getStore({name:'brevity-architect-jobs',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_TOKEN})
 const existing=await store.get(key,{type:'json'})
 if(existing)return existing
 const receipt={id,proposalId:record.id,state:'dispatching',requestedAt:new Date().toISOString(),requestedBy:member,notice:'Generation is not an implemented feature or an approved release. The workflow verifies code in isolation; publishing a prototype PR requires configured staging approval.'}
 const claimed=await store.setJSON(key,receipt,{onlyIfNew:true})
 if(claimed?.modified===false)return await store.get(key,{type:'json'})
 let result
 try{
  const response=await fetcher('https://api.github.com/repos/lsljco/brevity/actions/workflows/architect-prototype.yml/dispatches',{method:'POST',signal:AbortSignal.timeout(15000),headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','content-type':'application/json','x-github-api-version':'2022-11-28'},body:JSON.stringify({ref:'main',inputs:{proposal_id:id,packet:JSON.stringify(packet)}})})
  result={...receipt,state:response.status===204?'dispatched':'rejected',...(response.status===204?{}:{error:`GitHub rejected prototype dispatch (${response.status}). No automatic retry is attempted.`})}
 }catch{result={...receipt,state:'dispatch-unknown',error:'Dispatch outcome is unknown. Check GitHub Actions before retrying to avoid duplicate prototypes.'}}
 await store.setJSON(key,result)
 return result
}
