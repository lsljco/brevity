import { randomUUID } from 'node:crypto'
import { HOUSEHOLD_MEMBERS } from '../homehq/projectData.js'
import {
  HOUSEHOLD_SCHEDULE_STORAGE_KEY,
  normalizeHouseholdScheduleState,
} from './householdScheduleData.js'
import {
  HOUSEHOLD_CHORE_VERIFIERS,
  HOUSEHOLD_MAINTENANCE_STORAGE_KEY,
  buildHouseholdMaintenanceWeek,
  householdOccurrence,
  normalizeHouseholdMaintenanceState,
} from './householdMaintenanceData.js'
import {
  HOUSEHOLD_INVENTORY_STORAGE_KEY,
  normalizeInventoryItem,
  normalizeInventoryState,
} from './householdInventoryData.js'

export const HOUSEHOLD_ACTION_RESOURCE_KEYS = {
  schedule:HOUSEHOLD_SCHEDULE_STORAGE_KEY,
  maintenance:HOUSEHOLD_MAINTENANCE_STORAGE_KEY,
  inventory:HOUSEHOLD_INVENTORY_STORAGE_KEY,
}

export function householdResourceKeyForAction(type = '') {
  if (type.startsWith('household.schedule.')) return HOUSEHOLD_ACTION_RESOURCE_KEYS.schedule
  if (type.startsWith('household.maintenance.')) return HOUSEHOLD_ACTION_RESOURCE_KEYS.maintenance
  if (type.startsWith('household.inventory.')) return HOUSEHOLD_ACTION_RESOURCE_KEYS.inventory
  return ''
}

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const isoNow = context => (typeof context.now === 'function' ? context.now() : context.now instanceof Date ? context.now : new Date()).toISOString()
const createId = context => (typeof context.createId === 'function' ? context.createId() : randomUUID())
const uniqueMembers = values => [...new Set((values || []).filter(member=>HOUSEHOLD_MEMBERS.includes(member)))]
const assertMember = (value, label = 'member') => {
  if (!HOUSEHOLD_MEMBERS.includes(value)) throw new Error(`The reviewed ${label} is not a recognized household member.`)
  return value
}
const assertDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new Error('The household change requires an exact date.')
  return value
}
const assertTimeRange = (startTime, endTime) => {
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || endTime <= startTime) throw new Error('The household schedule requires an end time after its start time.')
}
const maintenanceTask = occurrenceId => {
  const date=assertDate(String(occurrenceId || '').slice(0,10))
  const task=buildHouseholdMaintenanceWeek(new Date(`${date}T12:00:00`)).flatMap(day=>day.tasks).find(item=>item.occurrenceId===occurrenceId)
  if (!task) throw new Error('That household responsibility no longer exists in the operating plan.')
  return task
}

export function householdRecordForOperation(value, operation) {
  const type=operation?.type || ''
  if (type.startsWith('household.schedule.')) {
    const state=normalizeHouseholdScheduleState(value)
    if (type.includes('.block.') || type.endsWith('.invitation.update')) return state.blocks.find(item=>item.id===operation.targetId) || null
    return state.routines.find(item=>item.id===operation.targetId) || null
  }
  if (type.startsWith('household.maintenance.')) {
    const state=normalizeHouseholdMaintenanceState(value)
    const task=maintenanceTask(operation.targetId)
    const occurrence=householdOccurrence(state,task)
    return { ...clone(occurrence),id:task.occurrenceId,owner:task.owners.length===1?task.owners[0]:'',owners:[...task.owners],participants:[...task.owners],verifiers:[...(task.verifiers || HOUSEHOLD_CHORE_VERIFIERS)],coveredBy:occurrence.coveredBy || '' }
  }
  if (type.startsWith('household.inventory.')) return normalizeInventoryState(value).items.find(item=>item.id===operation.targetId) || null
  return null
}

function scheduleOperation(value, operation, context) {
  const state=normalizeHouseholdScheduleState(value)
  const payload=clone(operation.payload || {})
  const actor=assertMember(context.actor,'actor')
  const now=isoNow(context)
  if (operation.type==='household.schedule.block.create') {
    const title=String(payload.title || '').trim()
    if (!title) throw new Error('A household time block requires a title.')
    const owner=assertMember(payload.owner || actor,'owner')
    const date=assertDate(payload.date || operation.targetDate)
    assertTimeRange(payload.startTime,payload.endTime)
    const participants=uniqueMembers(payload.participants).filter(member=>member!==owner)
    const attendance=Object.fromEntries(participants.map(member=>[member,member===actor?'accepted':'pending']))
    const item={id:createId(context),title,date,startTime:payload.startTime,endTime:payload.endTime,owner,participants,attendance,pillar:payload.pillar,notes:payload.notes || '',createdBy:actor,createdAt:now,updatedBy:actor,updatedAt:now}
    return normalizeHouseholdScheduleState({...state,blocks:[...state.blocks,item]})
  }
  if (operation.type==='household.schedule.block.update') {
    let found=false
    const blocks=state.blocks.map(block=>{
      if (block.id!==operation.targetId) return block
      found=true
      const next={...block,...payload,updatedBy:actor,updatedAt:now}
      next.title=String(next.title || '').trim()
      if (!next.title) throw new Error('A household time block requires a title.')
      next.owner=assertMember(next.owner,'owner');next.date=assertDate(next.date);assertTimeRange(next.startTime,next.endTime)
      next.participants=uniqueMembers(next.participants).filter(member=>member!==next.owner)
      next.attendance=Object.fromEntries(next.participants.map(member=>[member,block.attendance?.[member] || (member===actor?'accepted':'pending')]))
      return next
    })
    if (!found) throw new Error('That household time block no longer exists. Refresh Schedule and review the current record.')
    return normalizeHouseholdScheduleState({...state,blocks})
  }
  if (operation.type==='household.schedule.block.delete') {
    if (!state.blocks.some(item=>item.id===operation.targetId)) throw new Error('That household time block no longer exists.')
    return normalizeHouseholdScheduleState({...state,blocks:state.blocks.filter(item=>item.id!==operation.targetId)})
  }
  if (operation.type==='household.schedule.invitation.update') {
    let found=false
    const blocks=state.blocks.map(block=>{
      if (block.id!==operation.targetId) return block
      found=true
      if (!block.participants?.includes(actor) || block.owner===actor) throw new Error('Only the invited household member may answer this invitation.')
      if ((block.attendance?.[actor] || 'pending')===payload.response) throw new Error('That household invitation already has the reviewed response.')
      return {...block,attendance:{...(block.attendance || {}),[actor]:payload.response},updatedBy:actor,updatedAt:now}
    })
    if (!found) throw new Error('That household invitation no longer exists.')
    return normalizeHouseholdScheduleState({...state,blocks})
  }
  if (operation.type==='household.schedule.routine.create') {
    const title=String(payload.title || '').trim()
    if (!title) throw new Error('A household routine requires a title.')
    const owner=assertMember(payload.owner || actor,'owner')
    assertTimeRange(payload.startTime,payload.endTime)
    const days=[...new Set((payload.days || []).map(Number))].filter(day=>Number.isInteger(day)&&day>=0&&day<=6).sort()
    if (!days.length) throw new Error('A household routine requires at least one reviewed day.')
    const item={id:createId(context),title,owner,participants:uniqueMembers(payload.participants).filter(member=>member!==owner),days,startTime:payload.startTime,endTime:payload.endTime,pillar:payload.pillar,notes:payload.notes || '',enabled:payload.enabled!==false,createdBy:actor,createdAt:now,updatedBy:actor,updatedAt:now}
    return normalizeHouseholdScheduleState({...state,routines:[...state.routines,item]})
  }
  if (operation.type==='household.schedule.routine.update') {
    let found=false
    const routines=state.routines.map(routine=>{
      if (routine.id!==operation.targetId) return routine
      found=true
      const next={...routine,...payload,updatedBy:actor,updatedAt:now}
      next.title=String(next.title || '').trim()
      if (!next.title) throw new Error('A household routine requires a title.')
      next.owner=assertMember(next.owner,'owner');assertTimeRange(next.startTime,next.endTime)
      next.participants=uniqueMembers(next.participants).filter(member=>member!==next.owner)
      next.days=[...new Set((next.days || []).map(Number))].filter(day=>Number.isInteger(day)&&day>=0&&day<=6).sort()
      if (!next.days.length) throw new Error('A household routine requires at least one reviewed day.')
      return next
    })
    if (!found) throw new Error('That household routine no longer exists.')
    return normalizeHouseholdScheduleState({...state,routines})
  }
  if (operation.type==='household.schedule.routine.delete') {
    if (!state.routines.some(item=>item.id===operation.targetId)) throw new Error('That household routine no longer exists.')
    const overrides=Object.fromEntries(Object.entries(state.routineOverrides).filter(([key])=>!key.startsWith(`${operation.targetId}:`)))
    return normalizeHouseholdScheduleState({...state,routines:state.routines.filter(item=>item.id!==operation.targetId),routineOverrides:overrides})
  }
  if (operation.type==='household.schedule.occurrence.update') {
    if (!state.routines.some(item=>item.id===operation.targetId)) throw new Error('That household routine no longer exists.')
    const date=assertDate(payload.date || operation.targetDate)
    if (date!==operation.targetDate) throw new Error('The routine occurrence date changed after review.')
    if (!payload.cancelled) assertTimeRange(payload.startTime,payload.endTime)
    const key=`${operation.targetId}:${date}`
    const override={...(state.routineOverrides[key] || {}),...payload,updatedBy:actor,updatedAt:now}
    return normalizeHouseholdScheduleState({...state,routineOverrides:{...state.routineOverrides,[key]:override}})
  }
  throw new Error(`Unsupported household schedule change: ${operation.type}.`)
}

function maintenanceOperation(value, operation, context) {
  const state=normalizeHouseholdMaintenanceState(value)
  const task=maintenanceTask(operation.targetId)
  if (task.occurrenceId.slice(0,10)!==operation.targetDate) throw new Error('The household responsibility date changed after review.')
  const actor=assertMember(context.actor,'actor'),now=isoNow(context),prior=clone(householdOccurrence(state,task)),payload=operation.payload || {}
  let patch={},action='updated',note=''
  if (operation.type==='household.maintenance.coverage.update') {
    if (payload.coveredBy) assertMember(payload.coveredBy,'coverage member')
    if ((prior.coveredBy || '')===(payload.coveredBy || '')) throw new Error('That responsibility already has the reviewed coverage.')
    patch={coveredBy:payload.coveredBy || '',coverageConfirmedBy:payload.coveredBy?actor:''};action='coverage-updated'
  } else if (operation.type==='household.maintenance.exception.update') {
    note=payload.exception || '';patch={exception:note,exceptionReportedBy:note?actor:''};action=note?'exception-reported':'exception-cleared'
    if ((prior.exception || '')===note) throw new Error('That responsibility already has the reviewed exception.')
  } else if (operation.type==='household.maintenance.completion.update') {
    if (payload.action==='start') {
      if(prior.startedAt||prior.submittedAt||prior.approvedAt)throw new Error('That responsibility is already in progress, complete, or awaiting sign-off.')
      patch={startedAt:now,startedBy:actor,returnedAt:'',returnedBy:'',returnReason:''};action='started'
    } else if (payload.action==='submit') {
      if (prior.approvedAt || (prior.submittedAt && !prior.returnedAt)) throw new Error('That responsibility is already complete or awaiting sign-off.')
      patch={complete:!task.signoffRequired,startedAt:prior.startedAt||'',startedBy:prior.startedBy||'',completedAt:now,completedBy:actor,submittedAt:task.signoffRequired?now:'',submittedBy:task.signoffRequired?actor:'',approvedAt:'',approvedBy:'',returnedAt:'',returnedBy:'',returnReason:'',exception:''};action=task.signoffRequired?'submitted-for-signoff':'completed'
    } else if (payload.action==='approve') {
      if (!prior.submittedAt || prior.approvedAt) throw new Error('Only a currently submitted responsibility can be approved.')
      patch={complete:true,approvedAt:now,approvedBy:actor,returnedAt:'',returnedBy:'',returnReason:''};action='approved'
    } else if (payload.action==='return') {
      if (!prior.submittedAt || prior.approvedAt || !payload.reason) throw new Error('Returning a submitted responsibility requires a reason.')
      note=payload.reason;patch={complete:false,submittedAt:'',submittedBy:'',approvedAt:'',approvedBy:'',returnedAt:now,returnedBy:actor,returnReason:note};action='returned'
    } else if (payload.action==='reopen') {
      if (!prior.approvedAt && !prior.complete) throw new Error('Only a completed responsibility can be reopened.')
      patch={complete:false,startedAt:'',startedBy:'',completedAt:'',completedBy:'',submittedAt:'',submittedBy:'',approvedAt:'',approvedBy:'',returnedAt:'',returnedBy:'',returnReason:''};action='reopened'
    } else throw new Error('That household completion transition is not supported.')
  } else throw new Error(`Unsupported household maintenance change: ${operation.type}.`)
  const history=[...(Array.isArray(prior.history)?prior.history:[]),{action,by:actor,at:now,note}]
  const occurrence={...prior,...patch,history,updatedAt:now,updatedBy:actor}
  const occurrences={...state.occurrences,[task.occurrenceId]:occurrence}
  return normalizeHouseholdMaintenanceState({...state,occurrences,completions:occurrences})
}

function inventoryOperation(value, operation, context) {
  const state=normalizeInventoryState(value),payload=operation.payload || {},actor=assertMember(context.actor,'actor'),now=isoNow(context)
  if (operation.type==='household.inventory.item.create') {
    const item=normalizeInventoryItem({...payload,id:createId(context),updatedAt:now,updatedBy:actor})
    if (!item.name) throw new Error('An inventory item requires a name.')
    return normalizeInventoryState({...state,items:[...state.items,item]})
  }
  const current=state.items.find(item=>item.id===operation.targetId)
  if (!current) throw new Error('That inventory item no longer exists. Refresh Inventory and review the current record.')
  if (operation.type==='household.inventory.quantity.update') {
    const delta=Number(payload.delta),quantity=Number(current.quantity)+delta
    if (!Number.isFinite(delta) || delta===0 || quantity<0) throw new Error('The reviewed quantity adjustment would make inventory invalid or negative.')
    return normalizeInventoryState({...state,items:state.items.map(item=>item.id===current.id?{...item,quantity,updatedAt:now,updatedBy:actor}:item)})
  }
  if (operation.type==='household.inventory.waste.create') {
    const quantity=Number(payload.quantity)
    if (!Number.isFinite(quantity) || quantity<=0 || quantity>Number(current.quantity)) throw new Error('Discarded quantity must be positive and cannot exceed inventory on hand.')
    const entry={id:createId(context),itemId:current.id,name:current.name,category:current.category,quantity,unit:current.unit,estimatedValue:quantity*Number(current.unitCost||0),reason:payload.reason||'Discarded',recordedAt:now,recordedBy:actor}
    return normalizeInventoryState({...state,items:state.items.map(item=>item.id===current.id?{...item,quantity:Number(item.quantity)-quantity,updatedAt:now,updatedBy:actor}:item),waste:[entry,...state.waste]})
  }
  throw new Error(`Unsupported household inventory change: ${operation.type}.`)
}

export function applyHouseholdRecordOperation(value, operation, context = {}) {
  const type=operation?.type || ''
  // Keep the exact stored value as the journal's `before` image. The Action
  // executor compares it with the current resource during commit/Undo, so
  // normalizing an absent or older-schema resource here would create a false
  // version conflict even when the authoritative resource has not changed.
  if (type.startsWith('household.schedule.')) return {before:clone(value),after:scheduleOperation(value,operation,context)}
  if (type.startsWith('household.maintenance.')) return {before:clone(value),after:maintenanceOperation(value,operation,context)}
  if (type.startsWith('household.inventory.')) return {before:clone(value),after:inventoryOperation(value,operation,context)}
  throw new Error(`Unsupported household operation: ${type}.`)
}

export function householdPermissionForOperation({ operation, member, role, currentRecord }) {
  if (!operation?.type?.startsWith('household.')) return null
  if (role==='admin') return {allowed:true}
  if (operation.type==='household.schedule.block.create' || operation.type==='household.schedule.routine.create') {
    return operation.payload?.owner===member ? {allowed:true} : {allowed:false,reason:'Household members may create schedule records only for themselves.'}
  }
  if (operation.type==='household.schedule.invitation.update') return currentRecord?.participants?.includes(member)&&currentRecord?.owner!==member?{allowed:true}:{allowed:false,reason:'Only the invited member may answer this household invitation.'}
  if (operation.type.endsWith('.delete')) return {allowed:false,reason:'Deleting a household schedule record requires household-administrator access.'}
  if (operation.type.startsWith('household.schedule.')) {
    if (currentRecord?.owner!==member) return {allowed:false,reason:'Only the schedule owner or a household administrator may change this record.'}
    if (operation.payload?.owner && operation.payload.owner!==member) return {allowed:false,reason:'A household member cannot transfer schedule ownership to another member.'}
    return {allowed:true}
  }
  if (operation.type.startsWith('household.inventory.')) return {allowed:true}
  if (operation.type.startsWith('household.maintenance.')) {
    const owners=currentRecord?.owners || []
    const responsible=owners.includes('Everyone') || owners.includes(member) || currentRecord?.coveredBy===member
    const verifier=(currentRecord?.verifiers || HOUSEHOLD_CHORE_VERIFIERS).includes(member)
    if (operation.type==='household.maintenance.completion.update') {
      if (['approve','return','reopen'].includes(operation.payload?.action)) return verifier?{allowed:true}:{allowed:false,reason:'Only an assigned household verifier may review this completion.'}
      return responsible?{allowed:true}:{allowed:false,reason:'Only the responsible member or confirmed coverage member may submit this responsibility.'}
    }
    if (operation.type==='household.maintenance.coverage.update') {
      const coveredBy=operation.payload?.coveredBy || ''
      if (coveredBy && coveredBy!==member) return {allowed:false,reason:'A household member cannot confirm coverage on behalf of another member.'}
      return responsible||verifier?{allowed:true}:{allowed:false,reason:'Only the responsible member, confirmed coverage member, or verifier may change coverage.'}
    }
    return responsible||verifier?{allowed:true}:{allowed:false,reason:'Only the responsible member, confirmed coverage member, verifier, or administrator may change this responsibility.'}
  }
  return {allowed:false,reason:'That household operation is not enabled.'}
}
