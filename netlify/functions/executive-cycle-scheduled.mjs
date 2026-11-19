import '../lib/native-runtime.mjs'
import {preview} from '../lib/scoped-store.mjs'
import {householdDate} from '../lib/assistant-authoritative-context.mjs'
import {productionExecutiveRuns,dispatchExecutiveCycle,executiveReadiness} from '../lib/executive-runs.mjs'
export async function runScheduledExecutiveCycle({now=new Date(),isPreview=preview,repository=productionExecutiveRuns(),dispatch=dispatchExecutiveCycle,ready=executiveReadiness().ready}={}){
 // Both UTC slots are scheduled for DST; only the 03:15 Eastern slot runs.
 const hour=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(now)
 if(isPreview||hour!=='03')return {skipped:true}
 const config=await repository.config();if(!config.enabled||!ready)return {skipped:true}
 const {run}=await repository.create({id:'daily-'+householdDate(now),member:config.enabledBy,scheduled:true})
 if(run.status==='queued')return dispatch(run.id)
 return {duplicate:true}
}
export default async function handler(){await runScheduledExecutiveCycle()}
export const config={schedule:'15 7,8 * * *'}
