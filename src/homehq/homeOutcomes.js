import {visibleDayOutcomes} from '../household/dayOutcomes.js'
import {belongsToViewer} from '../household/todayGuidance.js'
import {rankDirectionPriorities} from '../household/priorityDirection.js'

// Action Mode saves requested work as assignments. Surface those dated tasks
// beside saved direction without copying or changing either source record.
export function homeOutcomes(plan, member, scope='household') {
 const visible = item => (!item.date || item.date===plan.date) &&
  !item.cancelled && !['cancelled','canceled'].includes(String(item.status||'').toLowerCase()) &&
  belongsToViewer(item,member,scope)
 const rows=visibleDayOutcomes(plan,member,scope).filter(visible).map(item=>({...item,sourceKind:'outcome'}))
 for(const item of plan.assignments||[]) {
  if(!item.title?.trim() || !visible(item)) continue
  if(item.id && rows.some(row=>row.id===item.id)) continue
  rows.push({...item,sourceKind:'assignment'})
 }
 return rankDirectionPriorities(rows)
}
