import { normalizeDailyPlan } from './dailyPlan.js'

const make = (id, level, title, detail, owner = 'Family') => ({ id, level, title, detail, owner })

export function deriveHouseholdNotifications(plan) {
  const p = normalizeDailyPlan(plan)
  const notes = []

  if (!p.health.dinner) notes.push(make('meal-dinner', 'action', 'Dinner needs a decision', 'Terica has not yet confirmed dinner.', 'Terica'))
  if (!p.fitness.location) notes.push(make('fitness-location', 'action', 'Fitness location unresolved', 'Choose the location before anyone leaves for the workout.', 'Larry'))
  if (!p.education.isaiah.owner) notes.push(make('isaiah-owner', 'action', 'Isaiah education owner unresolved', 'Assign the supervising adult for today.', 'Family'))

  p.decisions.filter(item => item.status !== 'complete' && item.status !== 'deferred').forEach(item => {
    notes.push(make(`decision-${item.id}`, item.priority === 'critical' ? 'critical' : 'action', item.title || 'Household decision required', item.notes || 'Resolve this decision during household alignment.', item.owner || 'Family'))
  })

  p.household.appointments.filter(item => item?.title && item?.startTime).forEach(item => {
    notes.push(make(`appointment-${item.id}`, 'awareness', item.title, `${item.startTime}${item.owner ? ` · ${item.owner}` : ''}`, item.owner || 'Family'))
  })

  p.ministry.meetings.filter(item => item?.title && item?.startTime).forEach(item => {
    notes.push(make(`ministry-${item.id}`, 'awareness', item.title, `${item.startTime} · Ministry`, item.owner || 'Family'))
  })

  return notes
}

export function notificationsForMember(plan, member) {
  return deriveHouseholdNotifications(plan).filter(note => note.owner === 'Family' || note.owner === member)
}
