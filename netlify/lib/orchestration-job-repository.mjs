import {getStore} from './scoped-store.mjs'
export function orchestrationJobStore(){return getStore({name:'brevity-orchestration-jobs',consistency:'strong'})}
export const orchestrationJobKey=()=>`${process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'}/runner`
export async function readOrchestrationInbox(member,{isAdmin=false}={}){
 const value=await orchestrationJobStore().get(orchestrationJobKey(),{type:'json'})
 return {coverage:isAdmin?value?.coverage:null,healthTrends:isAdmin?(value?.healthTrends||[]):[],messages:(value?.messages||[]).filter(m=>m.recipient===member),observations:(value?.observations||[]).filter(o=>o.member===member),lastRun:value?.lastRun||null,error:value?.error||null}
}
