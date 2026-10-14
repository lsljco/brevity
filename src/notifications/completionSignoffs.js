import {buildHouseholdMaintenanceWeek,normalizeHouseholdMaintenanceState} from '../household/householdMaintenanceData.js'
export const CHORE_RESOURCE='shared:brevity_household_maintenance_v1'
export const PROJECT_RESOURCE='shared:homehq_items_v1'
export function completionSignoffs({chores,projects,member}){
 if(!['Larry','Terica'].includes(member))return []
 const state=normalizeHouseholdMaintenanceState(chores?.value||{}),items=[]
 for(const [id,occurrence] of Object.entries(state.occurrences)){
  if(!occurrence.submittedAt||occurrence.approvedAt||occurrence.returnedAt||state.deletedOccurrences[id])continue
  const date=id.slice(0,10)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue
  const base=buildHouseholdMaintenanceWeek(date).flatMap(day=>day.tasks).find(task=>task.occurrenceId===id) || state.customChores.find(task=>id===`${task.date}:custom-${task.id}`)
  const task=base?{...base,...state.taskEdits[id]}:null
  if(!task)continue
  items.push({id,kind:'chore',title:task.title,date,submittedAt:occurrence.submittedAt,submittedBy:occurrence.submittedBy||occurrence.completedBy,details:task.details||[],version:chores.version,resource:CHORE_RESOURCE,reviewers:['Larry','Terica']})
 }
 if(member==='Larry')for(const project of Array.isArray(projects?.value)?projects.value:[]){const review=project.completionReview;if(review?.state!=='pending')continue;items.push({id:project.id,kind:'project',title:project.title,submittedAt:review.submittedAt,submittedBy:review.submittedBy,details:[project.notes,project.startDate?`Start: ${project.startDate}`:'',project.due?`Due: ${project.due}`:'',`Responsible: ${(project.raci?.responsible||[]).join(', ')||'Unassigned'}`,`Accountable: ${(project.raci?.accountable||[]).join(', ')||'Unassigned'}`].filter(Boolean),version:projects.version,resource:PROJECT_RESOURCE,reviewers:['Larry']})}
 return items.sort((a,b)=>a.submittedAt.localeCompare(b.submittedAt))
}
export function signoffOperation(item,action,reason=''){
 if(!['approve','return'].includes(action))throw Error('Choose approve or return.')
 if(action==='return'&&!reason.trim())throw Error('Add a reason so the owner knows what to correct.')
 return {type:item.kind==='chore'?'household.maintenance.completion.update':'project.review',targetId:item.id,targetDate:item.kind==='chore'?item.date:'',description:`${action==='approve'?'Sign off on':'Return'} ${item.kind}: ${item.title}`,payload:{action,reason:reason.trim()}}
}
