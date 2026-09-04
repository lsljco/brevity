import { FAMILY_CALENDAR_KEY, HOUSEHOLD_MEMBERS, readJson, writeJson } from '../homehq/projectData.js'

export const HOUSEHOLD_SCHEDULE_STORAGE_KEY = 'brevity_household_schedule_v1'
export const HOUSEHOLD_SCHEDULE_SOURCE = 'household-schedule'
export const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
const unique = values => [...new Set((values || []).filter(value => HOUSEHOLD_MEMBERS.includes(value)))]
const dateKey = value => {
  const date = value instanceof Date ? value : new Date(`${String(value || '').slice(0,10)}T12:00:00`)
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
const addDays = (value, amount) => { const date = new Date(`${dateKey(value)}T12:00:00`); date.setDate(date.getDate()+amount); return dateKey(date) }

export function normalizeHouseholdScheduleState(value = {}) {
  return {
    version: 1,
    blocks: Array.isArray(value.blocks) ? value.blocks : [],
    routines: Array.isArray(value.routines) ? value.routines : [],
    routineOverrides: value.routineOverrides && typeof value.routineOverrides === 'object' ? value.routineOverrides : {},
  }
}

export function createScheduleBlock(state, input, currentMember) {
  const owner = HOUSEHOLD_MEMBERS.includes(input.owner) ? input.owner : currentMember
  const participants = unique(input.participants)
  const attendance = Object.fromEntries(participants.map(member => [member, member === owner || member === currentMember ? 'accepted' : 'pending']))
  return normalizeHouseholdScheduleState({
    ...state,
    blocks: [...state.blocks, {
      id: uid('schedule'), title: String(input.title || '').trim(), date: dateKey(input.date || new Date()),
      startTime: input.startTime || '09:00', endTime: input.endTime || '10:00', owner,
      participants, attendance, pillar: input.pillar || 'Household Management', notes: input.notes || '',
      createdBy: currentMember, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }],
  })
}

export function updateScheduleBlock(state, id, patch, currentMember) {
  return normalizeHouseholdScheduleState({
    ...state,
    blocks: state.blocks.map(block => block.id === id ? { ...block, ...patch, updatedBy: currentMember, updatedAt: new Date().toISOString() } : block),
  })
}

export function deleteScheduleBlock(state, id) {
  return normalizeHouseholdScheduleState({ ...state, blocks: state.blocks.filter(block => block.id !== id) })
}

export function respondToInvitation(state, blockId, member, response) {
  return updateScheduleBlock(state, blockId, {
    attendance: { ...(state.blocks.find(block => block.id === blockId)?.attendance || {}), [member]: response },
  }, member)
}

export function createRoutine(state, input, currentMember) {
  const owner = HOUSEHOLD_MEMBERS.includes(input.owner) ? input.owner : currentMember
  return normalizeHouseholdScheduleState({
    ...state,
    routines: [...state.routines, {
      id: uid('routine'), title: String(input.title || '').trim(), owner,
      participants: unique(input.participants), days: (input.days || []).map(Number).filter(day => day >= 0 && day <= 6),
      startTime: input.startTime || '07:00', endTime: input.endTime || '08:00', pillar: input.pillar || 'Household Management',
      notes: input.notes || '', enabled: input.enabled !== false, createdBy: currentMember,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }],
  })
}

export function updateRoutine(state, id, patch, currentMember) {
  return normalizeHouseholdScheduleState({
    ...state,
    routines: state.routines.map(routine => routine.id === id ? { ...routine, ...patch, updatedBy: currentMember, updatedAt: new Date().toISOString() } : routine),
  })
}

export function deleteRoutine(state, id) {
  return normalizeHouseholdScheduleState({ ...state, routines: state.routines.filter(routine => routine.id !== id) })
}

export function overrideRoutineOccurrence(state, routineId, date, patch, currentMember) {
  const key = `${routineId}:${dateKey(date)}`
  return normalizeHouseholdScheduleState({
    ...state,
    routineOverrides: { ...state.routineOverrides, [key]: { ...(state.routineOverrides[key] || {}), ...patch, updatedBy: currentMember, updatedAt: new Date().toISOString() } },
  })
}

export function routineOccurrencesForDate(state, date) {
  const target = new Date(`${dateKey(date)}T12:00:00`)
  const day = target.getDay()
  return state.routines.filter(routine => routine.enabled && routine.days.includes(day)).map(routine => {
    const key = `${routine.id}:${dateKey(date)}`
    const override = state.routineOverrides[key] || {}
    return { ...routine, ...override, id: key, routineId: routine.id, date: dateKey(date), sourceType: 'routine', cancelled: Boolean(override.cancelled) }
  }).filter(item => !item.cancelled)
}

export function scheduleForMember(state, date, member) {
  const target = dateKey(date)
  const manual = state.blocks.filter(block => {
    if (block.date !== target) return false
    if (block.owner === member) return true
    if (!block.participants?.includes(member)) return false
    return (block.attendance?.[member] || 'pending') === 'accepted'
  }).map(block => ({ ...block, sourceType:'manual' }))
  const routines = routineOccurrencesForDate(state, target).filter(item => item.owner === member || item.participants?.includes(member))
  return [...manual, ...routines].sort((a,b) => `${a.startTime}-${a.endTime}`.localeCompare(`${b.startTime}-${b.endTime}`))
}

export function invitationsForMember(state, member) {
  return state.blocks.filter(block => block.participants?.includes(member) && block.owner !== member && (block.attendance?.[member] || 'pending') === 'pending')
}

function calendarEventForBlock(block) {
  const accepted = unique([block.owner, ...(block.participants || []).filter(member => (block.attendance?.[member] || 'pending') === 'accepted')])
  return {
    id: `${HOUSEHOLD_SCHEDULE_SOURCE}-${block.id}`, sourceId: `${HOUSEHOLD_SCHEDULE_SOURCE}-${block.id}`, source: HOUSEHOLD_SCHEDULE_SOURCE,
    title: block.title, date: block.date, start: block.date, time: block.startTime, endTime: block.endTime, allDay:false,
    members: accepted, participants: accepted, owner: block.owner || 'Family', calendarName:'Family', calendarSyncEnabled:true,
    status:'Scheduled', notes:[block.pillar, block.notes].filter(Boolean).join(' · '), updatedAt:block.updatedAt || new Date().toISOString(),
  }
}

function calendarEventForRoutine(item) {
  const members = unique([item.owner, ...(item.participants || [])])
  return {
    id:`${HOUSEHOLD_SCHEDULE_SOURCE}-${item.id}`, sourceId:`${HOUSEHOLD_SCHEDULE_SOURCE}-${item.id}`, source:HOUSEHOLD_SCHEDULE_SOURCE,
    title:item.title, date:item.date, start:item.date, time:item.startTime, endTime:item.endTime, allDay:false,
    members, participants:members, owner:item.owner || 'Family', calendarName:'Family', calendarSyncEnabled:true,
    status:'Routine', notes:[item.pillar,'Routine',item.notes].filter(Boolean).join(' · '), updatedAt:item.updatedAt || new Date().toISOString(),
  }
}

export function publishHouseholdScheduleEvents(storage, state, days = 42) {
  const normalized = normalizeHouseholdScheduleState(state)
  const start = dateKey(new Date())
  const routineEvents = []
  for (let index = 0; index < days; index += 1) routineOccurrencesForDate(normalized, addDays(start,index)).forEach(item => routineEvents.push(calendarEventForRoutine(item)))
  const manualEvents = normalized.blocks.filter(block => block.date >= start && block.date <= addDays(start,days)).map(calendarEventForBlock)
  const prior = readJson(storage,FAMILY_CALENDAR_KEY,[])
  const other = (Array.isArray(prior) ? prior : []).filter(event => event.source !== HOUSEHOLD_SCHEDULE_SOURCE)
  const events = [...manualEvents,...routineEvents]
  const result = writeJson(storage,FAMILY_CALENDAR_KEY,[...other,...events])
  if (result.ok && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('brevity-family-calendar-updated',{detail:events}))
  return { ...result, events }
}
