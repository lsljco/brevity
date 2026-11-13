import {payoffPriority} from './scenarioPayoffPlan.js'
export const orderedLiabilities=rows=>[...rows].sort((a,b)=>payoffPriority(a)-payoffPriority(b))
export function reorderLiability(rows,sourceId,targetId){
 const ordered=orderedLiabilities(rows),from=ordered.findIndex(r=>r.id===sourceId),to=ordered.findIndex(r=>r.id===targetId)
 if(from<0||to<0||from===to||payoffPriority(ordered[from])!==payoffPriority(ordered[to]))return null
 const [row]=ordered.splice(from,1);ordered.splice(to,0,row);return ordered
}
