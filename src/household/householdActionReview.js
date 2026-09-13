import { prepareDirectAction } from '../assistant/assistantApi.js'
import { requestActionReview } from '../assistant/actionEvents.js'
import { getAcknowledgedSharedStateVersion, syncSharedState } from './sharedState.js'
import { HOUSEHOLD_SCHEDULE_STORAGE_KEY, householdScheduleDate } from './householdScheduleData.js'
import { HOUSEHOLD_MAINTENANCE_STORAGE_KEY } from './householdMaintenanceData.js'
import { HOUSEHOLD_INVENTORY_STORAGE_KEY } from './householdInventoryData.js'

const quote = value => {
  const text=String(value || '').trim()
  return `“${text.slice(0, 80)}${text.length > 80 ? '…' : ''}”`
}
const clean = value => String(value || '').trim()
const number = (value, label, { min = 0, allowZero = true } = {}) => {
  const result=Number(value)
  if (!Number.isFinite(result) || result < min || (!allowZero && result === 0)) throw new Error(`${label} must be a valid ${allowZero ? 'non-negative ' : 'positive '}number.`)
  return result
}

export function scheduleBlockCreateOperation(draft) {
  const title=clean(draft?.title)
  if (!title) throw new Error('A time block requires a title.')
  return {
    type:'household.schedule.block.create', targetDate:draft.date || householdScheduleDate(),
    payload:{ title,date:draft.date || householdScheduleDate(),startTime:draft.startTime,endTime:draft.endTime,owner:draft.owner,participants:draft.participants || [],pillar:draft.pillar,notes:clean(draft.notes) },
    description:`Add ${quote(title)} to the reviewed household schedule.`,
  }
}

export function scheduleBlockUpdateOperation(before, draft) {
  if (!before?.id) throw new Error('That time block is no longer available. Refresh Schedule and try again.')
  const fields=['title','date','startTime','endTime','owner','participants','pillar','notes']
  const payload=Object.fromEntries(fields.flatMap(field=>JSON.stringify(before?.[field] ?? (field==='participants'?[]:''))===JSON.stringify(draft?.[field] ?? (field==='participants'?[]:''))?[]:[[field,field==='notes'||field==='title'?clean(draft?.[field]):draft?.[field]]]))
  if (!Object.keys(payload).length) throw new Error('Change at least one time-block field before requesting review.')
  if ('title' in payload && !payload.title) throw new Error('A time block requires a title.')
  return { type:'household.schedule.block.update',targetId:before.id,targetDate:draft.date || before.date,payload,description:`Update household time block ${quote(before.title)}. Reviewed fields: ${Object.keys(payload).join(', ')}.` }
}

export const scheduleBlockDeleteOperation = block => ({
  type:'household.schedule.block.delete', targetId:block.id, targetDate:block.date,
  payload:{}, description:`Delete household time block ${quote(block.title)}.`,
})

export const scheduleInvitationOperation = (block, response, member) => ({
  type:'household.schedule.invitation.update', targetId:block.id, targetDate:block.date,
  payload:{ response }, description:`Record ${member} as ${response} for household invitation ${quote(block.title)}.`,
})

export function scheduleRoutineCreateOperation(draft) {
  const title=clean(draft?.title)
  if (!title) throw new Error('A routine requires a title.')
  if (!draft?.days?.length) throw new Error('A routine requires at least one day.')
  return { type:'household.schedule.routine.create',targetDate:householdScheduleDate(),payload:{title,owner:draft.owner,participants:draft.participants||[],days:draft.days,startTime:draft.startTime,endTime:draft.endTime,pillar:draft.pillar,notes:clean(draft.notes),enabled:draft.enabled!==false},description:`Create recurring household routine ${quote(title)}.` }
}

export function scheduleRoutineUpdateOperation(before, draft) {
  if (!before?.id) throw new Error('That routine is no longer available. Refresh Routines and try again.')
  const fields=['title','owner','participants','days','startTime','endTime','pillar','notes','enabled']
  const payload=Object.fromEntries(fields.flatMap(field=>JSON.stringify(before?.[field])===JSON.stringify(draft?.[field])?[]:[[field,field==='notes'||field==='title'?clean(draft?.[field]):draft?.[field]]]))
  if (!Object.keys(payload).length) throw new Error('Change at least one routine field before requesting review.')
  if ('title' in payload && !payload.title) throw new Error('A routine requires a title.')
  if ('days' in payload && !payload.days?.length) throw new Error('A routine requires at least one day.')
  return { type:'household.schedule.routine.update',targetId:before.id,targetDate:householdScheduleDate(),payload,description:`Update recurring household routine ${quote(before.title)}. Reviewed fields: ${Object.keys(payload).join(', ')}.` }
}

export const scheduleRoutineDeleteOperation = routine => ({ type:'household.schedule.routine.delete',targetId:routine.id,targetDate:householdScheduleDate(),payload:{},description:`Delete recurring household routine ${quote(routine.title)}.` })

export const scheduleOccurrenceOperation = (routine, date, patch) => ({
  type:'household.schedule.occurrence.update',targetId:routine.routineId || routine.id,targetDate:date,
  payload:{date,...patch},description:patch.cancelled?`Skip ${quote(routine.title)} on ${date} only.`:`Change ${quote(routine.title)} on ${date} only.`,
})

export const maintenanceCoverageOperation = (task, coveredBy) => ({ type:'household.maintenance.coverage.update',targetId:task.occurrenceId,targetDate:task.occurrenceId.slice(0,10),payload:{coveredBy:coveredBy==='Original owner'?'':coveredBy},description:`Change coverage for ${quote(task.title)} on ${task.occurrenceId.slice(0,10)}.` })
export const maintenanceExceptionOperation = (task, exception) => ({ type:'household.maintenance.exception.update',targetId:task.occurrenceId,targetDate:task.occurrenceId.slice(0,10),payload:{exception:clean(exception)},description:`${clean(exception)?'Report or update':'Clear'} the exception for ${quote(task.title)} on ${task.occurrenceId.slice(0,10)}.` })
export const maintenanceCompletionOperation = (task, action, reason='') => ({ type:'household.maintenance.completion.update',targetId:task.occurrenceId,targetDate:task.occurrenceId.slice(0,10),payload:{action,...(clean(reason)?{reason:clean(reason)}:{})},description:`${action[0].toUpperCase()}${action.slice(1)} ${quote(task.title)} for ${task.occurrenceId.slice(0,10)}.` })
const chorePayload=draft=>({title:clean(draft.title),date:draft.date,startTime:draft.startTime||'',endTime:draft.endTime||'',timing:clean(draft.timing)||'Flexible',category:clean(draft.category)||'Household chore',zone:clean(draft.zone)||'Whole House',owners:draft.owners||[],details:Array.isArray(draft.details)?draft.details:[],signoffRequired:draft.signoffRequired!==false})
export const maintenanceChoreCreateOperation=draft=>({type:'household.maintenance.chore.create',targetDate:draft.date,payload:chorePayload(draft),description:`Add household chore ${quote(draft.title)} on ${draft.date}.`})
export const maintenanceChoreUpdateOperation=(task,draft)=>({type:'household.maintenance.chore.update',targetId:task.occurrenceId,targetDate:task.occurrenceId.slice(0,10),payload:chorePayload(draft),description:`Update household chore ${quote(task.title)}. Reviewed fields include its date, time, owners, description, and completion standard.`})
export const maintenanceChoreDeleteOperation=task=>({type:'household.maintenance.chore.delete',targetId:task.occurrenceId,targetDate:task.occurrenceId.slice(0,10),payload:{},description:`Delete household chore ${quote(task.title)} for ${task.occurrenceId.slice(0,10)}.`})

export function inventoryItemCreateOperation(draft) {
  const name=clean(draft?.name)
  if (!name) throw new Error('An inventory item requires a name.')
  const location=draft?.location==='Other'?clean(draft?.locationCustom):clean(draft?.location)
  if (!location) throw new Error('Enter the custom storage location before reviewing this inventory item.')
  return { type:'household.inventory.item.create',targetDate:householdScheduleDate(),payload:{name,category:draft.category,location,quantity:number(draft.quantity,'Quantity'),unit:clean(draft.unit)||'units',parLevel:number(draft.parLevel,'Reorder level'),unitCost:number(draft.unitCost||0,'Unit cost'),expiresOn:draft.expiresOn||'',notes:clean(draft.notes)},description:`Add inventory item ${quote(name)} in ${quote(location)} with the reviewed quantity, par level, and unit cost.` }
}
export const inventoryQuantityOperation = (item, delta) => ({ type:'household.inventory.quantity.update',targetId:item.id,targetDate:householdScheduleDate(),payload:{delta:number(delta,'Quantity adjustment',{min:-Number.MAX_SAFE_INTEGER,allowZero:false})},description:`Adjust ${quote(item.name)} by ${delta>0?'+':''}${delta} ${item.unit}.` })
export const inventoryWasteOperation = (item, quantity, reason) => ({ type:'household.inventory.waste.create',targetId:item.id,targetDate:householdScheduleDate(),payload:{quantity:number(quantity,'Discarded quantity',{allowZero:false}),reason:clean(reason)||'Discarded'},description:`Record ${quantity} ${item.unit} of ${quote(item.name)} as discarded. Finance will derive the projected waste impact from the approved inventory record.` })

const storageKeyForOperation = operation => {
  if (operation.type.startsWith('household.schedule.')) return HOUSEHOLD_SCHEDULE_STORAGE_KEY
  if (operation.type.startsWith('household.maintenance.')) return HOUSEHOLD_MAINTENANCE_STORAGE_KEY
  if (operation.type.startsWith('household.inventory.')) return HOUSEHOLD_INVENTORY_STORAGE_KEY
  throw new Error('That household operation is not connected to a synchronized record.')
}

export async function requestHouseholdActionReview({ summary, operation, storage = localStorage }) {
  const key=storageKeyForOperation(operation)
  let expectedVersion
  try { expectedVersion=getAcknowledgedSharedStateVersion(storage,key) }
  catch(error){
    if(error?.code!=='SHARED_STATE_VERSION_UNAVAILABLE')throw error
    await syncSharedState(storage)
    expectedVersion=getAcknowledgedSharedStateVersion(storage,key)
  }
  const result=await prepareDirectAction({summary,operation,expectedVersion})
  if (!result?.proposal?.id) throw new Error('Action Mode did not return a reviewable household proposal.')
  requestActionReview(result.proposal)
  return result.proposal
}
