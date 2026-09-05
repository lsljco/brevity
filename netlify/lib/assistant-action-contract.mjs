import { randomUUID } from 'node:crypto'

export const HOUSEHOLD_MEMBERS = ['Larry', 'Lorenzo', 'Terica', 'Nyla', 'Javin', 'Isaiah']
export const ACTION_DOMAINS = ['planning', 'calendar', 'projects', 'finance']
export const ACTION_TYPES = {
  'decision.update': 'planning',
  'assignment.create': 'planning',
  'assignment.update': 'planning',
  'project.create': 'projects',
  'project.update': 'projects',
  'calendar.create': 'calendar',
  'calendar.update': 'calendar',
  'calendar.delete': 'calendar',
  'transaction.categorize': 'finance',
  'budget.update': 'finance',
  'recurring.update': 'finance',
  'recurring.delete': 'finance',
}
export const FORBIDDEN_ACTION_PATTERN = /payment|purchase|transfer|withdraw|deposit|connect|disconnect|password|credential|bank\.account/i
export const SCOPES = ['this-item', 'this-and-future']
const STANDARD_FIELDS = ['title', 'notes', 'owner', 'participants', 'status', 'date', 'time', 'allDay', 'priority', 'category', 'amount', 'month', 'value', 'raci', 'pushToFamilyCalendar', 'frequency', 'endDate']
const STRONG_TYPES = new Set(['calendar.delete', 'recurring.delete'])
const MAX_OPERATIONS = 8

const resourceGroupForOperation = operation => {
  if (operation.domain === 'planning') return `plan:${operation.targetDate}`
  if (operation.domain === 'projects') return 'shared:brevity_projects_v1'
  if (operation.type === 'transaction.categorize') return 'shared:brevity_transaction_overrides_v1'
  if (operation.type === 'budget.update') return 'shared:brevity_budget_monthly_v1'
  if (operation.type.startsWith('recurring.')) return 'shared:brevity_recurring_plan_v1'
  if (operation.domain === 'calendar') return 'calendar:apple-family'
  return operation.domain
}

const clean = (value, max = 500) => String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)
const cleanId = value => clean(value, 160).replace(/[^a-zA-Z0-9_:@./-]/g, '-')
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))

export function defaultActionPermissions(role = 'member') {
  return role === 'admin'
    ? { planning:true, calendar:true, projects:true, finance:true }
    : { planning:true, calendar:true, projects:true, finance:false }
}

export function normalizePermissionMatrix(input = {}) {
  return Object.fromEntries(HOUSEHOLD_MEMBERS.map(member => {
    const defaults=defaultActionPermissions(member === 'Larry' ? 'admin' : 'member')
    return [member, member === 'Larry' ? defaults : {
      ...defaults,
      ...Object.fromEntries(ACTION_DOMAINS.map(domain => [domain, Boolean(input?.[member]?.[domain] ?? defaults[domain])])),
    }]
  }))
}

export function actionRisk(type, scope = 'this-item', count = 1) {
  if (STRONG_TYPES.has(type) || scope === 'this-and-future' || count > 1) return 'strong-confirmation'
  return 'confirmation'
}

export function normalizeActionOperation(input = {}) {
  const type = clean(input.type, 80)
  if (!ACTION_TYPES[type] || FORBIDDEN_ACTION_PATTERN.test(type)) throw new Error(`Unsupported assistant action: ${type || 'missing type'}.`)
  let payload = {}
  try { payload = typeof input.payloadJson === 'string' ? JSON.parse(input.payloadJson || '{}') : object(input.payload) }
  catch { throw new Error(`The ${type} action contains invalid details.`) }
  payload = Object.fromEntries(Object.entries(object(payload)).filter(([key]) => STANDARD_FIELDS.includes(key)))
  for (const field of ['title', 'status', 'category', 'frequency', 'priority']) if (field in payload) payload[field] = clean(payload[field], 300)
  if ('notes' in payload) payload.notes = clean(payload.notes, 6000)
  for (const field of ['amount', 'value', 'month']) if (field in payload) {
    const numeric = Number(payload[field])
    if (!Number.isFinite(numeric)) throw new Error(`The proposed ${field} must be a valid number.`)
    payload[field] = numeric
  }
  for (const field of ['allDay', 'pushToFamilyCalendar']) if (field in payload) payload[field] = Boolean(payload[field])
  for (const field of ['date', 'endDate']) if (payload[field] && !isDate(payload[field])) throw new Error(`The proposed ${field} must use YYYY-MM-DD.`)
  if (payload.owner && ![...HOUSEHOLD_MEMBERS, 'Family'].includes(payload.owner)) throw new Error('The proposed owner is not a recognized household member.')
  if (payload.participants) payload.participants = [...new Set((Array.isArray(payload.participants) ? payload.participants : []).filter(member => HOUSEHOLD_MEMBERS.includes(member)))]
  if (payload.raci) payload.raci = Object.fromEntries(['responsible', 'accountable', 'consulted', 'informed'].map(role => [role, [...new Set((Array.isArray(payload.raci?.[role]) ? payload.raci[role] : []).filter(member => HOUSEHOLD_MEMBERS.includes(member)))]]))
  const requestedScopes = Array.isArray(input.allowedScopes) ? input.allowedScopes.filter(scope => SCOPES.includes(scope)) : []
  const allowedScopes = [...new Set(requestedScopes.length ? requestedScopes : ['this-item'])]
  if (!type.startsWith('recurring.')) allowedScopes.splice(0, allowedScopes.length, 'this-item')
  const defaultScope = allowedScopes.includes(input.defaultScope) ? input.defaultScope : allowedScopes[0]
  const operation = {
    id: cleanId(input.id) || randomUUID(),
    type,
    domain: ACTION_TYPES[type],
    description: clean(input.description, 800) || type,
    targetId: cleanId(input.targetId),
    targetDate: isDate(input.targetDate) ? input.targetDate : '',
    payload,
    allowedScopes,
    defaultScope,
    risk: actionRisk(type, defaultScope),
  }
  if ((type.endsWith('.update') || type.endsWith('.delete') || type === 'transaction.categorize') && !operation.targetId) throw new Error(`The ${type} action requires an exact record id.`)
  if ((operation.domain === 'planning' || type.startsWith('recurring.')) && !operation.targetDate) throw new Error(`The ${type} action requires an exact occurrence date.`)
  if (type === 'calendar.create' && !isDate(payload.date || operation.targetDate)) throw new Error('A new calendar event requires an exact date.')
  return operation
}

export function normalizeActionProposal(input = {}, { member, role = 'member', now = new Date(), id = randomUUID() } = {}) {
  const operations = (Array.isArray(input.operations) ? input.operations : []).slice(0, MAX_OPERATIONS).map(normalizeActionOperation)
  if (!operations.length) throw new Error('The assistant did not identify a supported Brevity action.')
  const resourceGroups = new Set(operations.map(resourceGroupForOperation))
  if (resourceGroups.size > 1) throw new Error('For safety, each Action Mode confirmation must change one Brevity record group. Ask Brevity to prepare the remaining changes next.')
  const risk = operations.some(operation => operation.risk === 'strong-confirmation') || operations.length > 1 ? 'strong-confirmation' : 'confirmation'
  return {
    id,
    state:'pending',
    summary:clean(input.summary, 1000) || 'Review the proposed Brevity change.',
    actor:member,
    actorRole:role,
    createdAt:now.toISOString(),
    expiresAt:new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    risk,
    operations,
  }
}

export function permissionForOperation({ operation, member, role, permissions, currentRecord }) {
  if (role === 'admin') return { allowed:true }
  if (!permissions?.[operation.domain]) return { allowed:false, reason:`${operation.domain} actions are not enabled for ${member}.` }
  if (operation.domain === 'finance') return { allowed:false, reason:'Financial administration requires household-administrator access.' }
  if (operation.type.endsWith('.delete')) return { allowed:false, reason:'Deletion requires household-administrator access.' }
  const owners = [currentRecord?.owner, ...(currentRecord?.participants || []), ...(currentRecord?.raci?.responsible || [])].filter(Boolean)
  if (operation.type.includes('update') && owners.length && !owners.includes(member) && !owners.includes('Family')) return { allowed:false, reason:`${member} can update only records they own or participate in.` }
  if (operation.type.endsWith('.create') && operation.payload.owner && ![member, 'Family'].includes(operation.payload.owner)) return { allowed:false, reason:`${member} cannot create work owned solely by another member.` }
  return { allowed:true }
}

export function selectedOperation(operation, selectedScope) {
  const scope = operation.allowedScopes.includes(selectedScope) ? selectedScope : operation.defaultScope
  return { ...operation, selectedScope:scope, risk:actionRisk(operation.type, scope) }
}
