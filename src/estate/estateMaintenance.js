export const MAINTENANCE_EVENT_STATUSES = Object.freeze(['due', 'scheduled', 'in_progress', 'completed', 'cost_recorded'])
export const MAINTENANCE_RECURRENCE_UNITS = Object.freeze(['days', 'weeks', 'months', 'years'])

const NEXT_STATUS = Object.freeze({ due: 'scheduled', scheduled: 'in_progress', in_progress: 'completed', completed: 'cost_recorded' })
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const clean = (value, length = 240) => String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, length)
const money = value => value === '' || value == null ? null : Number(value)

export function validEstateDate(value) {
  const match = String(value || '').match(ISO_DATE)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3])
}

export function addMaintenanceRecurrence(dateKey, recurrence) {
  if (!validEstateDate(dateKey)) throw new Error('A valid maintenance due date is required.')
  const interval = Number(recurrence?.interval)
  const unit = recurrence?.unit
  if (!Number.isInteger(interval) || interval < 1 || interval > 365 || !MAINTENANCE_RECURRENCE_UNITS.includes(unit)) throw new Error('Maintenance recurrence must use a valid interval and unit.')
  const [year, month, day] = dateKey.split('-').map(Number)
  let next
  if (unit === 'days' || unit === 'weeks') next = new Date(Date.UTC(year, month - 1, day + interval * (unit === 'weeks' ? 7 : 1)))
  else {
    const monthOffset = unit === 'years' ? interval * 12 : interval
    const targetMonth = month - 1 + monthOffset
    const targetYear = year + Math.floor(targetMonth / 12)
    const normalizedMonth = ((targetMonth % 12) + 12) % 12
    const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate()
    next = new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, lastDay)))
  }
  return next.toISOString().slice(0, 10)
}

function findRecord(workspace, collection, id, required = false) {
  if (!id && !required) return null
  const record = (workspace[collection] || []).find(item => item.id === id)
  if (!record) throw new Error(`${collection} record ${id || '(missing)'} was not found in this Estate workspace.`)
  return record
}

function cycleRecords({ workspace, plan, scheduledFor, occurrenceNumber, now, createId }) {
  const eventId = `maintenance-event-${createId()}`
  const workOrderId = `work-order-${createId()}`
  const event = {
    id: eventId,
    propertyId: workspace.propertyId,
    maintenancePlanId: plan.id,
    workOrderId,
    occurrenceNumber,
    scheduledFor,
    dueDate: scheduledFor,
    status: 'due',
    responsibleMember: plan.responsibleMember,
    expectedCost: plan.expectedCost,
    actualCost: null,
    calendar: { syncEnabled: plan.calendarSyncEnabled, sourceId: `estate-maintenance-${eventId}`, href: null, etag: null, syncedAt: null },
    createdAt: now,
    updatedAt: now,
  }
  const workOrder = {
    id: workOrderId,
    propertyId: workspace.propertyId,
    systemId: plan.systemId,
    assetId: plan.assetId,
    maintenancePlanId: plan.id,
    maintenanceEventId: eventId,
    title: plan.title,
    description: plan.instructions,
    status: 'due',
    priority: plan.priority,
    responsibleMember: plan.responsibleMember,
    preferredVendorId: plan.preferredVendorId,
    scheduledDate: scheduledFor,
    dueDate: scheduledFor,
    expectedCost: plan.expectedCost,
    actualCost: null,
    notes: '',
    generatedFromPlan: true,
    createdAt: now,
    updatedAt: now,
  }
  return { event, workOrder }
}

export function createMaintenancePlanCycle(workspace, input, { now = new Date().toISOString(), createId = () => crypto.randomUUID() } = {}) {
  if (!workspace?.propertyId) throw new Error('A durable Estate workspace is required.')
  const title = clean(input?.title, 180)
  if (!title) throw new Error('Maintenance plan title is required.')
  const system = findRecord(workspace, 'systems', clean(input.systemId, 160), true)
  const asset = findRecord(workspace, 'assets', clean(input.assetId, 160))
  const vendor = findRecord(workspace, 'vendors', clean(input.preferredVendorId, 160))
  if (asset?.systemId && asset.systemId !== system.id) throw new Error('The selected asset does not belong to the selected property system.')
  const recurrence = { interval: Number(input.recurrence?.interval), unit: clean(input.recurrence?.unit, 20) }
  addMaintenanceRecurrence(input.nextDueDate, recurrence)
  const expectedCost = money(input.expectedCost)
  if (expectedCost != null && (!Number.isFinite(expectedCost) || expectedCost < 0)) throw new Error('Expected maintenance cost must be zero or greater.')
  const planId = `maintenance-plan-${createId()}`
  const plan = {
    id: planId,
    propertyId: workspace.propertyId,
    systemId: system.id,
    assetId: asset?.id || null,
    title,
    instructions: clean(input.instructions, 2000),
    status: 'active',
    priority: ['low', 'medium', 'high', 'critical'].includes(input.priority) ? input.priority : 'medium',
    recurrence,
    responsibleMember: clean(input.responsibleMember, 80) || null,
    preferredVendorId: vendor?.id || null,
    expectedCost,
    calendarSyncEnabled: input.calendarSyncEnabled !== false,
    nextDueDate: input.nextDueDate,
    currentEventId: null,
    currentWorkOrderId: null,
    completedCycleCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  const { event, workOrder } = cycleRecords({ workspace, plan, scheduledFor: plan.nextDueDate, occurrenceNumber: 1, now, createId })
  plan.currentEventId = event.id
  plan.currentWorkOrderId = workOrder.id
  return {
    workspace: {
      ...workspace,
      maintenancePlans: [...workspace.maintenancePlans, plan],
      maintenanceEvents: [...workspace.maintenanceEvents, event],
      workOrders: [...workspace.workOrders, workOrder],
    },
    plan,
    event,
    workOrder,
  }
}

export function transitionMaintenanceEvent(workspace, input, { now = new Date().toISOString(), createId = () => crypto.randomUUID() } = {}) {
  const event = findRecord(workspace, 'maintenanceEvents', clean(input?.eventId, 180), true)
  const plan = findRecord(workspace, 'maintenancePlans', event.maintenancePlanId, true)
  const workOrder = findRecord(workspace, 'workOrders', event.workOrderId, true)
  const target = clean(input.status, 40)
  if (NEXT_STATUS[event.status] !== target) throw new Error(`Maintenance event must move from ${event.status} to ${NEXT_STATUS[event.status] || 'no further status'}.`)
  const actualCost = money(input.actualCost)
  if (target === 'cost_recorded' && (actualCost == null || !Number.isFinite(actualCost) || actualCost < 0)) throw new Error('Record the actual cost before generating the next service.')
  const nextEvent = { ...event, status: target, updatedAt: now }
  const nextWorkOrder = { ...workOrder, status: target, updatedAt: now }
  if (target === 'completed') {
    nextEvent.completedAt = now
    nextWorkOrder.completedAt = now
  }
  if (target === 'cost_recorded') {
    nextEvent.actualCost = actualCost
    nextEvent.costRecordedAt = now
    nextWorkOrder.actualCost = actualCost
    nextWorkOrder.costRecordedAt = now
  }
  let nextPlan = { ...plan, updatedAt: now }
  let generated = null
  let maintenanceEvents = workspace.maintenanceEvents.map(item => item.id === event.id ? nextEvent : item)
  let workOrders = workspace.workOrders.map(item => item.id === workOrder.id ? nextWorkOrder : item)
  if (target === 'cost_recorded' && plan.status === 'active') {
    const scheduledFor = addMaintenanceRecurrence(event.scheduledFor, plan.recurrence)
    generated = cycleRecords({ workspace, plan, scheduledFor, occurrenceNumber: Number(event.occurrenceNumber || 0) + 1, now, createId })
    maintenanceEvents = [...maintenanceEvents, generated.event]
    workOrders = [...workOrders, generated.workOrder]
    nextPlan = {
      ...nextPlan,
      lastCompletedDate: event.scheduledFor,
      completedCycleCount: Number(plan.completedCycleCount || 0) + 1,
      nextDueDate: scheduledFor,
      currentEventId: generated.event.id,
      currentWorkOrderId: generated.workOrder.id,
    }
  }
  return {
    workspace: {
      ...workspace,
      maintenancePlans: workspace.maintenancePlans.map(item => item.id === plan.id ? nextPlan : item),
      maintenanceEvents,
      workOrders,
    },
    event: nextEvent,
    workOrder: nextWorkOrder,
    generated,
  }
}

export function maintenanceCalendarEvent({ event, plan, workOrder, propertyName = 'Estate' }) {
  if (!event || !plan || !workOrder || event.status === 'cost_recorded' || !event.calendar?.syncEnabled) return null
  const participants = event.responsibleMember ? [event.responsibleMember] : []
  return {
    sourceId: event.calendar.sourceId || `estate-maintenance-${event.id}`,
    title: `${propertyName} · ${workOrder.title}`,
    date: event.scheduledFor,
    allDay: true,
    pillar: 'household',
    owner: event.responsibleMember || 'Family',
    participants,
    priority: ['high', 'critical'].includes(workOrder.priority),
  }
}

export function nextMaintenanceStatus(status) {
  return NEXT_STATUS[status] || null
}
