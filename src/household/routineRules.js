// Exact routine IDs keep relative timing stable when a title changes.
export function parseRoutineTiming(value='') {
 if(!value)return null
 const rule=typeof value==='string'?JSON.parse(value):value
 if(!rule||typeof rule.anchorId!=='string'||!rule.anchorId||!Number.isInteger(rule.offsetMinutes)||rule.offsetMinutes<0||rule.offsetMinutes>240||!Number.isInteger(rule.durationMinutes)||rule.durationMinutes<5||rule.durationMinutes>720)throw Error('Choose a saved routine, a delay of 0–240 minutes and a duration of 5–720 minutes.')
 return {anchorId:rule.anchorId,offsetMinutes:rule.offsetMinutes,durationMinutes:rule.durationMinutes}
}
export function validateRoutineTiming(routine,routines){
 const seen=new Set([routine.id]);let current=routine
 while(current?.timingRuleJson){const rule=parseRoutineTiming(current.timingRuleJson);if(seen.has(rule.anchorId))throw Error('Routine timing cannot form a loop.');seen.add(rule.anchorId);current=routines.find(x=>x.id===rule.anchorId);if(!current)throw Error('The routine used for timing no longer exists. Choose another routine.');if(current.owner!==routine.owner&&!current.participants?.includes(routine.owner))throw Error('The timing routine must include the same member.')}
}
const minute=x=>{const [h,m]=String(x).split(':').map(Number);return h*60+m}
const clock=x=>`${String(Math.floor(x/60)).padStart(2,'0')}:${String(x%60).padStart(2,'0')}`
export function resolveRoutineTiming(items){
 const byId=new Map(items.map(x=>[x.routineId||x.id,x])),resolved=new Map()
 function resolve(item,path=new Set()){
  const id=item.routineId||item.id;if(resolved.has(id))return resolved.get(id)
  if(path.has(id))return {...item,timingIssue:'Routine timing forms a loop.'}
  path=new Set(path).add(id);let result=item
  if(item.timingRuleJson&&!item.hasTimeOverride){
   try{const rule=parseRoutineTiming(item.timingRuleJson),source=byId.get(rule.anchorId),anchor=source?resolve(source,path):null
    if(!anchor||anchor.cancelled||anchor.timingIssue)result={...item,timingIssue:'The preceding routine is unavailable on this day. Choose a time for this day.'}
    else {const start=minute(anchor.endTime)+rule.offsetMinutes,end=start+rule.durationMinutes;result=end>=1440?{...item,timingIssue:'This timing runs past midnight. Choose a time for this day.'}:{...item,startTime:clock(start),endTime:clock(end)}}
   }catch{result={...item,timingIssue:'The saved timing rule needs review.'}}
  }
  resolved.set(id,result);return result
 }
 return items.map(x=>{const item=resolve(x);return item.timingIssue?{...item,startTime:'',endTime:''}:item})
}
