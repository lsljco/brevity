import {householdScheduleCalendarEvents,normalizeHouseholdScheduleState} from '../../src/household/householdScheduleData.js'

// Calendar projections are not stored Schedule records. Resolve an exact dated
// projection before review; never interpret a one-day removal as deleting a routine.
export function bindScheduleOperation(operation,{householdScheduleState}={}) {
  if(!operation.type?.startsWith('household.schedule.')||!operation.targetId?.startsWith('household-schedule-'))return operation
  const date=operation.targetDate
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw Error('Choose the exact Schedule date before reviewing this change.')
  if(!householdScheduleState)throw Error('Household Schedule could not be verified. Refresh and ask again.')
  const state=normalizeHouseholdScheduleState(householdScheduleState)
  const event=householdScheduleCalendarEvents(state,{start:date,days:1}).find(item=>item.id===operation.targetId)
  if(!event)throw Error('That dated Schedule item no longer exists. Refresh and ask Brevity to prepare a new review.')
  const sourceId=operation.targetId.slice('household-schedule-'.length)
  const block=state.blocks.find(item=>item.id===sourceId)
  if(block&&['household.schedule.block.update','household.schedule.block.delete'].includes(operation.type))return {...operation,targetId:block.id}
  const routine=state.routines.find(item=>`${item.id}:${date}`===sourceId)
  if(routine&&operation.type==='household.schedule.block.delete') {
    const payload=operation.payload||JSON.parse(operation.payloadJson||'{}')
    if(Object.keys(payload).length)throw Error('A one-day Schedule removal cannot contain additional changes.')
    return {...operation,type:'household.schedule.occurrence.update',targetId:routine.id,payload:{date,cancelled:true},payloadJson:JSON.stringify({date,cancelled:true})}
  }
  if(routine&&operation.type==='household.schedule.occurrence.update')return {...operation,targetId:routine.id}
  throw Error('This is a dated routine occurrence. Use household.schedule.occurrence.update with the saved routine id and exact date; never delete the whole routine to remove one day.')
}
