import {normalizeDailyPlanPriority} from './dailyPlanStatus.js'
// Household preference: Think Tank drives direction ahead of routine upkeep.
// Explicit critical/high/low settings win; equal-impact items keep saved order.
export function priorityImpact(item){
 const priority=normalizeDailyPlanPriority(item.priority)
 if(priority==='critical')return 4
 if(priority==='high')return 3
 if(priority==='low')return 0
 return /\bthink[ -]tank\b/i.test(item.title||'')?2:1
}
export const rankDirectionPriorities=items=>[...items].sort((a,b)=>priorityImpact(b)-priorityImpact(a))
export function todayDirection(plan,priorities){
 const focus=String(plan.household?.keyFocus||'').trim()
 return focus?{title:focus,explicitFocus:true}:priorities[0]||null
}
