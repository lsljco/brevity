import { randomUUID } from 'node:crypto'
import { MEALS_BY_ID, MEAL_TYPES } from '../../src/meals/mealLibrary.js'
import { householdPermissionForOperation, householdResourceKeyForAction } from '../../src/household/householdActionModel.js'
import { canonicalMeetingNameText } from '../../src/finance/meetingNames.js'
import { DAILY_PLAN_PILLARS, normalizeDailyPlanActionPayload } from './daily-plan-action-fields.mjs'

export const HOUSEHOLD_MEMBERS = ['Larry', 'Lorenzo', 'Terica', 'Nyla', 'Javin', 'Isaiah']
export const ACTION_DOMAINS = ['planning', 'calendar', 'projects', 'finance']
export const ACTION_TYPES = {
  'decision.create': 'planning',
  'decision.update': 'planning',
  'assignment.create': 'planning',
  'assignment.update': 'planning',
  'plan.overview.update': 'planning',
  'plan.pillar.update': 'planning',
  'plan.alignment.update': 'planning',
  'plan.recap.update': 'planning',
  'sermon.activate': 'planning',
  'household.schedule.block.create': 'planning',
  'household.schedule.block.update': 'planning',
  'household.schedule.block.delete': 'planning',
  'household.schedule.invitation.update': 'planning',
  'household.schedule.routine.create': 'planning',
  'household.schedule.routine.update': 'planning',
  'household.schedule.routine.delete': 'planning',
  'household.schedule.occurrence.update': 'planning',
  'household.maintenance.coverage.update': 'planning',
  'household.maintenance.exception.update': 'planning',
  'household.maintenance.completion.update': 'planning',
  'household.maintenance.chore.create': 'planning',
  'household.maintenance.chore.update': 'planning',
  'household.maintenance.chore.delete': 'planning',
  'household.inventory.item.create': 'planning',
  'household.inventory.quantity.update': 'planning',
  'household.inventory.waste.create': 'planning',
  'project.create': 'projects',
  'project.update': 'projects',
  'project.delete': 'projects',
  'calendar.create': 'calendar',
  'calendar.update': 'calendar',
  'calendar.delete': 'calendar',
  'transaction.categorize': 'finance',
  'transaction.update': 'finance',
  'transaction.rule.create': 'finance',
  'transaction.rule.delete': 'finance',
  'meeting.action.create': 'planning',
  'meeting.action.update': 'planning',
  'meeting.correction.create': 'finance',
  'meeting.correction.update': 'finance',
  'meeting.session.create': 'planning',
  'meeting.workspace.update': 'finance',
  'meeting.history.update': 'planning',
  'budget.update': 'finance',
  'forecast.update': 'finance',
  'finance.account.link': 'finance',
  'recurring.create': 'finance',
  'recurring.update': 'finance',
  'recurring.delete': 'finance',
  'debt.create': 'finance',
  'debt.update': 'finance',
  'debt.delete': 'finance',
  'debt.transaction.apply': 'finance',
  'meal.substitute': 'planning',
}
export const FORBIDDEN_ACTION_PATTERN = /payment|purchase|transfer|withdraw|deposit|connect|disconnect|password|credential|bank\.account/i
export const SCOPES = ['this-item', 'this-and-future']
const ACTION_PAYLOAD_FIELDS = {
  'decision.create': ['title', 'notes', 'owner', 'participants', 'status', 'date'],
  'decision.update': ['title', 'notes', 'owner', 'participants', 'status', 'date'],
  'assignment.create': ['title', 'notes', 'owner', 'participants', 'status', 'date', 'priority'],
  'assignment.update': ['title', 'notes', 'owner', 'participants', 'status', 'date', 'priority'],
  'plan.overview.update': ['patch', 'origin'],
  'plan.pillar.update': ['pillar', 'patch', 'origin'],
  'plan.alignment.update': ['patch'],
  'plan.recap.update': ['patch'],
  'sermon.activate': ['draftId', 'sourceHash', 'candidateJson'],
  'household.schedule.block.create': ['title', 'date', 'startTime', 'endTime', 'owner', 'participants', 'pillar', 'notes'],
  'household.schedule.block.update': ['title', 'date', 'startTime', 'endTime', 'owner', 'participants', 'pillar', 'notes'],
  'household.schedule.block.delete': [],
  'household.schedule.invitation.update': ['response'],
  'household.schedule.routine.create': ['title', 'owner', 'participants', 'days', 'startTime', 'endTime', 'pillar', 'notes', 'enabled'],
  'household.schedule.routine.update': ['title', 'owner', 'participants', 'days', 'startTime', 'endTime', 'pillar', 'notes', 'enabled'],
  'household.schedule.routine.delete': [],
  'household.schedule.occurrence.update': ['date', 'startTime', 'endTime', 'cancelled'],
  'household.maintenance.coverage.update': ['coveredBy'],
  'household.maintenance.exception.update': ['exception'],
  'household.maintenance.completion.update': ['action', 'reason'],
  'household.maintenance.chore.create': ['title','date','startTime','endTime','timing','category','zone','owners','details','signoffRequired'],
  'household.maintenance.chore.update': ['title','date','startTime','endTime','timing','category','zone','owners','details','signoffRequired'],
  'household.maintenance.chore.delete': [],
  'household.inventory.item.create': ['name', 'category', 'location', 'quantity', 'unit', 'parLevel', 'unitCost', 'expiresOn', 'notes'],
  'household.inventory.quantity.update': ['delta'],
  'household.inventory.waste.create': ['quantity', 'reason'],
  'project.create': ['title', 'type', 'room', 'roomCustom', 'notes', 'owner', 'status', 'priority', 'date', 'endDate', 'estcost', 'actcost', 'raci', 'cname', 'cphone', 'cemail', 'caddress', 'bizLicense', 'coi', 'workersComp'],
  'project.update': ['title', 'type', 'room', 'roomCustom', 'notes', 'status', 'priority', 'date', 'endDate', 'estcost', 'actcost', 'raci', 'cname', 'cphone', 'cemail', 'caddress', 'bizLicense', 'coi', 'workersComp'],
  'project.delete': [],
  'calendar.create': ['title', 'notes', 'owner', 'participants', 'date', 'time', 'allDay', 'priority'],
  'calendar.update': ['title', 'notes', 'owner', 'participants', 'date', 'time', 'allDay', 'priority'],
  'calendar.delete': [],
  'transaction.categorize': ['category'],
  'transaction.update': ['name', 'category'],
  'transaction.rule.create': ['title', 'matchText', 'matchField', 'matchMode', 'category', 'accountId', 'applyToExisting', 'createdDate'],
  'transaction.rule.delete': [],
  'meeting.action.create': ['text', 'owner', 'due', 'status', 'financialEffect', 'meetingDate', 'cadence'],
  'meeting.action.update': ['text', 'owner', 'due', 'status'],
  'meeting.correction.create': ['label', 'value', 'reason', 'source', 'scope', 'status', 'origin', 'meetingDate', 'cadence'],
  'meeting.correction.update': ['label', 'value', 'reason', 'source', 'scope', 'status', 'origin'],
  'meeting.session.create': ['cadence', 'meetingDate', 'startedAt', 'endedAt', 'summary', 'notes', 'transcript', 'actions', 'corrections'],
  'meeting.workspace.update': ['monthStatus', 'expenseFocus', 'cadence', 'noteIndex', 'note'],
  'meeting.history.update': ['summary', 'notes', 'transcript'],
  'budget.update': ['month', 'year', 'lineId', 'recordId', 'lineName', 'category', 'direction', 'accountId', 'legacyYear', 'legacyAccountId', 'value', 'amount'],
  'forecast.update': ['title', 'description', 'notes', 'planningExpense', 'expenseMode', 'incomeAction', 'incomeId', 'monthlyNet', 'annualGross', 'contribution', 'remote', 'employment'],
  'finance.account.link': ['plaidAccountId'],
  'recurring.create': ['title', 'notes', 'category', 'amount', 'frequency', 'date', 'endDate', 'transactionType', 'accountId', 'transferAccountId'],
  'recurring.update': ['title', 'notes', 'category', 'amount', 'frequency', 'date', 'endDate', 'transactionType', 'accountId', 'transferAccountId'],
  'recurring.delete': [],
  'debt.create': ['creditor', 'accountName', 'debtType', 'originalBalance', 'currentBalance', 'interestRate', 'interestMethod', 'paymentsPerYear', 'fixedInterestAmount', 'minimumPayment', 'dueDay', 'paymentMatchText', 'status', 'notes'],
  'debt.update': ['creditor', 'accountName', 'debtType', 'originalBalance', 'currentBalance', 'interestRate', 'interestMethod', 'paymentsPerYear', 'fixedInterestAmount', 'minimumPayment', 'dueDay', 'paymentMatchText', 'status', 'notes'],
  'debt.delete': [],
  'debt.transaction.apply': ['transactionId', 'transactionDate', 'transactionName', 'amount', 'nonPrincipalAmount', 'paymentRule'],
  'meal.substitute': ['mealType', 'mealId'],
}
const STRING_FIELDS = new Set(['creditor', 'accountName', 'debtType', 'paymentMatchText', 'interestMethod', 'transactionId', 'transactionName', 'title', 'type', 'room', 'roomCustom', 'description', 'status', 'category', 'frequency', 'priority', 'matchText', 'expenseMode', 'incomeAction', 'incomeId', 'employment', 'time', 'startTime', 'endTime', 'pillar', 'response', 'coveredBy', 'exception', 'action', 'location', 'unit', 'mealType', 'mealId', 'name', 'goal', 'needsReview', 'text', 'label', 'reason', 'source', 'scope', 'summary', 'transcript', 'transactionType', 'financialEffect', 'cadence', 'origin', 'startedAt', 'endedAt', 'monthStatus', 'expenseFocus', 'note', 'lineId', 'recordId', 'lineName', 'direction', 'cname', 'cphone', 'cemail', 'caddress'])
const NUMBER_FIELDS = new Set(['originalBalance', 'currentBalance', 'interestRate', 'paymentsPerYear', 'fixedInterestAmount', 'minimumPayment', 'dueDay', 'amount', 'nonPrincipalAmount', 'value', 'month', 'year', 'legacyYear', 'planningExpense', 'monthlyNet', 'annualGross', 'contribution', 'noteIndex', 'quantity', 'parLevel', 'unitCost', 'delta'])
const BOOLEAN_FIELDS = new Set(['allDay', 'pushToFamilyCalendar', 'remote', 'bizLicense', 'coi', 'workersComp', 'enabled', 'cancelled', 'applyToExisting', 'signoffRequired'])
const DATE_FIELDS = new Set(['date', 'endDate', 'createdDate', 'meetingDate', 'expiresOn', 'transactionDate'])
const ACTION_ENUMS = {
  'decision.create': { status:['needs-decision', 'determined', 'complete', 'deferred'] },
  'decision.update': { status:['needs-decision', 'determined', 'complete', 'deferred'] },
  'assignment.create': { status:['pending', 'needs-decision', 'ready', 'in-progress', 'complete', 'deferred'], priority:['critical', 'high', 'normal', 'low'] },
  'assignment.update': { status:['pending', 'needs-decision', 'ready', 'in-progress', 'complete', 'deferred'], priority:['critical', 'high', 'normal', 'low'] },
  'project.create': { type:['Renovation', 'Maintenance', 'Repair'], status:['To Do', 'In Progress', 'Done'], priority:['High', 'Medium', 'Low'] },
  'project.update': { type:['Renovation', 'Maintenance', 'Repair'], status:['To Do', 'In Progress', 'Done'], priority:['High', 'Medium', 'Low'] },
  'calendar.create': { priority:['high', 'normal'] },
  'calendar.update': { priority:['high', 'normal'] },
  'forecast.update': { expenseMode:['scenario', 'operating'], incomeAction:['create', 'delete'] },
  'transaction.rule.create': { matchField:['originalStatement', 'merchantName'], matchMode:['contains', 'exactly', 'starts'] },
  'recurring.create': { frequency:['once', 'daily', 'weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly'], transactionType:['income', 'expense', 'transfer'] },
  'recurring.update': { frequency:['once', 'daily', 'weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly'], transactionType:['income', 'expense', 'transfer'] },
  'debt.create': { debtType:['Personal loan','Credit card','Student loan','Mortgage','Auto loan','Medical','Other'], status:['Active','Deferred','Paid off'], interestMethod:['Amortized APR','Fixed interest per payment','Principal only'] },
  'debt.update': { debtType:['Personal loan','Credit card','Student loan','Mortgage','Auto loan','Medical','Other'], status:['Active','Deferred','Paid off'], interestMethod:['Amortized APR','Fixed interest per payment','Principal only'] },
  'meeting.action.create': { status:['open'], cadence:['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] },
  'meeting.action.update': { status:['open', 'done'] },
  'meeting.correction.create': {
    source:['Bank Verified', 'Forecast', 'User Confirmed', 'Proposed'],
    scope:['this occurrence', 'going forward', 'underlying data is wrong'],
    status:['proposed'],
    cadence:['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
  },
  'meeting.correction.update': {
    source:['Bank Verified', 'Forecast', 'User Confirmed', 'Proposed'],
    scope:['this occurrence', 'going forward', 'underlying data is wrong'],
    status:['proposed', 'approved', 'dismissed'],
  },
  'meeting.session.create': { cadence:['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] },
  'meeting.workspace.update': { cadence:['monthly', 'quarterly', 'yearly'], monthStatus:['green', 'yellow', 'red'] },
  'household.schedule.invitation.update': { response:['accepted', 'declined'] },
  'household.maintenance.completion.update': { action:['start', 'submit', 'approve', 'return', 'reopen'] },
}
const STRONG_TYPES = new Set(['debt.delete', 'project.delete', 'calendar.delete', 'recurring.delete', 'transaction.rule.delete', 'plan.overview.update', 'sermon.activate', 'household.schedule.block.delete', 'household.schedule.routine.delete', 'household.maintenance.chore.delete', 'finance.account.link'])
const MAX_OPERATIONS = 8

const resourceGroupForOperation = operation => {
  if (operation.type === 'meal.substitute') return `meal:${operation.targetDate}`
  if (operation.type === 'sermon.activate') return 'sermon:active'
  const householdKey=householdResourceKeyForAction(operation.type)
  if (householdKey) return `shared:${householdKey}`
  // Finance Meeting narrative and commitments use the planning permission,
  // but remain one separately versioned meeting record rather than a dated
  // daily plan. Resolve the exact resource before the generic domain branch.
  if (operation.type.startsWith('meeting.')) return 'shared:brevity_finance_meetings_v1'
  if (operation.domain === 'planning') return `plan:${operation.targetDate}`
  if (operation.domain === 'projects') return 'shared:homehq_items_v1'
  if (operation.type === 'transaction.categorize' || operation.type === 'transaction.update') return 'shared:brevity_transaction_overrides_v1'
  if (operation.type === 'transaction.rule.create' || operation.type === 'transaction.rule.delete') return 'shared:lslj_tx_rules_v1'
  if (operation.type === 'budget.update') return 'shared:brevity_budget_monthly_v1'
  if (operation.type === 'forecast.update') return 'shared:brevity_finance_scenarios_v1'
  if (operation.type === 'finance.account.link') return 'shared:lslj_finance_v9'
  if (operation.type.startsWith('recurring.')) return 'shared:brevity_recurring_plan_v1'
  if (operation.domain === 'calendar') return 'calendar:apple-family'
  return operation.domain
}

const clean = (value, max = 500) => String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)
const cleanMultiline = (value, max) => String(value || '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max)
const cleanId = value => clean(value, 160).replace(/[^a-zA-Z0-9_:@./-]/g, '-')
const isDate = value => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3])
}
const isTime = value => {
  if (value === '') return true
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
  if (!match) return false
  const hour = Number(match[1]), minute = Number(match[2])
  return minute < 60 && (match[3] ? hour >= 1 && hour <= 12 : hour <= 23)
}

const assertString = (type, field, value) => {
  if (typeof value !== 'string') throw new Error(`The ${type} action requires ${field} to be text.`)
}

function normalizeParticipants(type, value) {
  if (!Array.isArray(value)) throw new Error(`The ${type} action requires participants to be a list.`)
  if (value.some(member => typeof member !== 'string' || !HOUSEHOLD_MEMBERS.includes(member))) throw new Error(`The ${type} action contains an unrecognized participant.`)
  return [...new Set(value)]
}

function normalizeRaci(type, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`The ${type} action requires RACI to be an object.`)
  const roles = ['responsible', 'accountable', 'consulted', 'informed']
  const unsupported = Object.keys(value).find(role => !roles.includes(role))
  if (unsupported) throw new Error(`The ${type} action contains an unsupported RACI role: ${unsupported}.`)
  return Object.fromEntries(roles.map(role => {
    const members = value[role] ?? []
    if (!Array.isArray(members)) throw new Error(`The ${type} action requires RACI ${role} to be a list.`)
    if (members.some(member => typeof member !== 'string' || !HOUSEHOLD_MEMBERS.includes(member))) throw new Error(`The ${type} action contains an unrecognized RACI member.`)
    return [role, [...new Set(members)]]
  }))
}

const isIsoDateTime=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&!Number.isNaN(Date.parse(value))

function normalizeMeetingSessionActions(value){
  if(!Array.isArray(value)||value.length>20)throw new Error('A Finance Meeting can review no more than 20 extracted commitments at once.')
  return value.map((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error(`Finance Meeting commitment ${index+1} is invalid.`)
    const unsupported=Object.keys(item).find(field=>!['text','owner','due','financialEffect'].includes(field))
    if(unsupported)throw new Error(`Finance Meeting commitment ${index+1} contains an unsupported field: ${unsupported}.`)
    const text=canonicalMeetingNameText(clean(item.text,800)),owner=canonicalMeetingNameText(clean(item.owner,120)),due=clean(item.due,20),financialEffect=canonicalMeetingNameText(clean(item.financialEffect,500))
    if(!text)throw new Error(`Finance Meeting commitment ${index+1} requires text.`)
    if(owner&&![...HOUSEHOLD_MEMBERS,'Family'].includes(owner))throw new Error(`Finance Meeting commitment ${index+1} has an unrecognized owner.`)
    if(due&&!isDate(due))throw new Error(`Finance Meeting commitment ${index+1} requires a valid due date.`)
    return{text,owner,due,financialEffect}
  })
}

function normalizeMeetingSessionCorrections(value){
  if(!Array.isArray(value)||value.length>20)throw new Error('A Finance Meeting can review no more than 20 proposed corrections at once.')
  return value.map((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error(`Finance Meeting correction ${index+1} is invalid.`)
    const unsupported=Object.keys(item).find(field=>!['label','value','reason','source','scope','origin'].includes(field))
    if(unsupported)throw new Error(`Finance Meeting correction ${index+1} contains an unsupported field: ${unsupported}.`)
    const label=canonicalMeetingNameText(clean(item.label,500)),reason=canonicalMeetingNameText(cleanMultiline(item.reason,6000)),source=clean(item.source,120),scope=clean(item.scope,120),origin=canonicalMeetingNameText(clean(item.origin,300))
    if(!label)throw new Error(`Finance Meeting correction ${index+1} requires a name.`)
    if(!['string','number'].includes(typeof item.value)||(typeof item.value==='number'&&!Number.isFinite(item.value)))throw new Error(`Finance Meeting correction ${index+1} requires a valid value.`)
    if(!['Bank Verified','Forecast','User Confirmed','Proposed'].includes(source))throw new Error(`Finance Meeting correction ${index+1} has an invalid source.`)
    if(!['this occurrence','going forward','underlying data is wrong'].includes(scope))throw new Error(`Finance Meeting correction ${index+1} has an invalid scope.`)
    return{label,value:typeof item.value==='number'?item.value:canonicalMeetingNameText(clean(item.value,1000)),reason,source,scope,origin}
  })
}

function normalizeActionPayload(type, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`The ${type} action details must be an object.`)
  if (type.startsWith('plan.')) return normalizeDailyPlanActionPayload(type, input)
  const payload = input
  const allowed = new Set(ACTION_PAYLOAD_FIELDS[type])
  const unsupported = Object.keys(payload).find(field => !allowed.has(field))
  if (unsupported) throw new Error(`The ${type} action contains an unsupported field: ${unsupported}.`)
  const normalized = {}
  for (const [field, value] of Object.entries(payload)) {
    if(type==='meeting.session.create'&&field==='actions'){
      normalized.actions=normalizeMeetingSessionActions(value)
    }else if(type==='meeting.session.create'&&field==='corrections'){
      normalized.corrections=normalizeMeetingSessionCorrections(value)
    }else if ((type === 'meeting.correction.update'||type==='meeting.correction.create') && field === 'value') {
      if (!['string', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('The meeting correction value must be text or a valid number.')
      normalized[field] = typeof value === 'number' ? value : canonicalMeetingNameText(clean(value, 1000))
    } else if (field === 'days') {
      if (!Array.isArray(value) || value.length > 7 || value.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('A household routine requires days numbered from 0 through 6.')
      normalized.days = [...new Set(value)].sort((left, right) => left - right)
    } else if (type === 'sermon.activate' && field === 'candidateJson') {
      assertString(type, field, value)
      if (value.length > 800_000) throw new Error('The reviewed sermon candidate exceeds Brevity’s activation capacity.')
      try { normalized.candidateJson = JSON.stringify(JSON.parse(value)) }
      catch { throw new Error('The reviewed sermon candidate is not valid JSON.') }
    } else if (type === 'sermon.activate' && (field === 'draftId' || field === 'sourceHash')) {
      assertString(type, field, value)
      normalized[field] = clean(value, field === 'sourceHash' ? 64 : 160)
    } else if (field === 'accountId' || field === 'transferAccountId' || field === 'legacyAccountId') {
      assertString(type, field, value)
      normalized[field] = cleanId(value)
    } else if (field === 'plaidAccountId') {
      assertString(type, field, value)
      normalized[field] = clean(value, 512)
    } else if (STRING_FIELDS.has(field)) {
      assertString(type, field, value)
      const cleaned = ['summary', 'reason', 'transcript', 'note'].includes(field)
        ? cleanMultiline(value, field === 'transcript' ? 50_000 : 6000)
        : clean(value, field === 'time' ? 20 : 300)
      normalized[field] = type.startsWith('meeting.') && ['text','label','reason','summary','transcript','financialEffect','origin','expenseFocus','note'].includes(field) ? canonicalMeetingNameText(cleaned) : cleaned
    } else if (field === 'notes') {
      assertString(type, field, value)
      const cleaned=clean(value, 6000)
      normalized[field] = type.startsWith('meeting.') ? canonicalMeetingNameText(cleaned) : cleaned
    } else if (field === 'estcost' || field === 'actcost') {
      if (value === '') normalized[field] = ''
      else {
        const amount=typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(amount) || amount < 0) throw new Error(`The proposed ${field} must be a non-negative amount.`)
        normalized[field] = amount.toFixed(2)
      }
    } else if (NUMBER_FIELDS.has(field)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`The proposed ${field} must be a valid number.`)
      normalized[field] = value
    } else if (BOOLEAN_FIELDS.has(field)) {
      if (typeof value !== 'boolean') throw new Error(`The ${type} action requires ${field} to be true or false.`)
      normalized[field] = value
    } else if (DATE_FIELDS.has(field) || field === 'due') {
      assertString(type, field, value)
      if (value && !isDate(value)) throw new Error(`The proposed ${field} must use a valid YYYY-MM-DD date.`)
      normalized[field] = value
    } else if (field === 'owner') {
      assertString(type, field, value)
      const owner=type.startsWith('meeting.')?canonicalMeetingNameText(value):value
      if (owner && ![...HOUSEHOLD_MEMBERS, 'Family'].includes(owner)) throw new Error('The proposed owner is not a recognized household member.')
      normalized[field] = owner
    } else if (field === 'participants') {
      normalized[field] = normalizeParticipants(type, value)
    } else if (field === 'owners') {
      normalized[field] = normalizeParticipants(type, value)
    } else if (field === 'details') {
      if(!Array.isArray(value)||value.length>20)throw new Error('A household chore supports no more than 20 checklist items.')
      normalized[field]=value.map(item=>clean(item,500)).filter(Boolean)
    } else if (field === 'raci') {
      normalized[field] = normalizeRaci(type, value)
    } else if (type === 'debt.transaction.apply' && field === 'paymentRule') {
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('A debt payment rule must be an object.')
      const unsupportedRuleField=Object.keys(value).find(key=>!['enabled','matchText','matchField','matchMode','accountId','nonPrincipalAmount'].includes(key))
      if(unsupportedRuleField)throw new Error(`The debt payment rule contains an unsupported field: ${unsupportedRuleField}.`)
      normalized.paymentRule={enabled:value.enabled===true,matchText:clean(value.matchText,300),matchField:clean(value.matchField,40),matchMode:clean(value.matchMode,40),accountId:cleanId(String(value.accountId||'')),nonPrincipalAmount:Number(value.nonPrincipalAmount||0)}
    } else if (field === 'splits') {
      if (!Array.isArray(value) || value.length > 20) throw new Error(`The ${type} action requires no more than 20 transaction splits.`)
      normalized[field] = value.map((split, index) => {
        if (!split || typeof split !== 'object' || Array.isArray(split)) throw new Error(`Transaction split ${index + 1} is invalid.`)
        const category=clean(split.cat || split.category, 120),amount=Number(split.amount)
        if (!category || !Number.isFinite(amount) || amount < 0) throw new Error(`Transaction split ${index + 1} requires a category and non-negative amount.`)
        return { cat:category, amount }
      })
    }
  }
  if ('time' in normalized && !isTime(normalized.time)) throw new Error('The proposed time must use HH:MM, optionally followed by AM or PM.')
  for (const field of ['startTime', 'endTime']) if (field in normalized && !isTime(normalized[field])) throw new Error(`The proposed ${field} must use HH:MM, optionally followed by AM or PM.`)
  if(type==='meeting.session.create'){
    if(!isIsoDateTime(normalized.startedAt)||!isIsoDateTime(normalized.endedAt))throw new Error('A saved Finance Meeting requires exact start and end timestamps.')
    if(Date.parse(normalized.endedAt)<Date.parse(normalized.startedAt))throw new Error('A Finance Meeting cannot end before it starts.')
  }
  for (const [field, values] of Object.entries(ACTION_ENUMS[type] || {})) {
    if (field in normalized && !values.includes(normalized[field])) throw new Error(`The proposed ${field} is not valid for ${type}.`)
  }
  return normalized
}

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
  try { payload = typeof input.payloadJson === 'string' ? JSON.parse(input.payloadJson || '{}') : input.payload ?? {} }
  catch { throw new Error(`The ${type} action contains invalid details.`) }
  payload = normalizeActionPayload(type, payload)
  const requestedScopes = Array.isArray(input.allowedScopes) ? input.allowedScopes.filter(scope => SCOPES.includes(scope)) : []
  const allowedScopes = [...new Set(requestedScopes.length ? requestedScopes : ['this-item'])]
  if (!['recurring.update', 'recurring.delete'].includes(type)) allowedScopes.splice(0, allowedScopes.length, 'this-item')
  // Recurrence shape is a series-level concern. Never allow a frequency or
  // end-date edit to masquerade as an isolated-occurrence change.
  if (type === 'recurring.update' && ('frequency' in payload || 'endDate' in payload)) {
    allowedScopes.splice(0, allowedScopes.length, 'this-and-future')
  }
  const defaultScope = allowedScopes.includes(input.defaultScope) ? input.defaultScope : allowedScopes[0]
  const baseDescription = clean(input.description, 800) || type
  const plannedTransferNotice = type.startsWith('recurring.')
    && (payload.transactionType === 'transfer' || Boolean(payload.transferAccountId))
    && !/forecast[- ]only planned transfer/i.test(baseDescription)
      ? 'Forecast-only planned transfer; no money will move'
      : ''
  const fixedRecurringScope = ['recurring.update', 'recurring.delete'].includes(type) && allowedScopes.length === 1
    ? defaultScope === 'this-and-future' ? 'This and future items' : 'This item only'
    : ''
  const reviewedDescription = plannedTransferNotice ? `${baseDescription} · ${plannedTransferNotice}` : baseDescription
  const operation = {
    id: cleanId(input.id) || randomUUID(),
    type,
    domain: ACTION_TYPES[type],
    description: fixedRecurringScope && !reviewedDescription.toLowerCase().includes(fixedRecurringScope.toLowerCase())
      ? `${reviewedDescription} · ${fixedRecurringScope}`
      : reviewedDescription,
    targetId: cleanId(input.targetId),
    targetDate: isDate(input.targetDate) ? input.targetDate : '',
    payload,
    allowedScopes,
    defaultScope,
    risk: actionRisk(type, defaultScope, type === 'transaction.rule.create' && payload.applyToExisting ? 2 : 1),
  }
  if ((type.endsWith('.update') || type.endsWith('.delete') || type === 'transaction.categorize') && !operation.targetId) throw new Error(`The ${type} action requires an exact record id.`)
  if (((operation.domain === 'planning' && type !== 'sermon.activate' && !type.startsWith('meeting.')) || type.startsWith('recurring.')) && !operation.targetDate) throw new Error(`The ${type} action requires an exact occurrence date.`)
  if (!type.endsWith('.delete') && !Object.keys(payload).length) throw new Error(`The ${type} action requires at least one reviewed change.`)
  if (type === 'plan.overview.update' && operation.targetId !== 'overview') throw new Error('A daily-plan overview action requires the exact overview record.')
  if (type === 'plan.pillar.update' && (!DAILY_PLAN_PILLARS.includes(payload.pillar) || operation.targetId !== payload.pillar)) throw new Error('A daily-plan pillar action requires the exact pillar record.')
  if (type === 'plan.alignment.update' && operation.targetId !== 'morningAlignment') throw new Error('A Morning Alignment action requires the exact alignment record.')
  if (type === 'plan.recap.update' && operation.targetId !== 'recap') throw new Error('A daily recap action requires the exact recap record.')
  if (type === 'sermon.activate') {
    if (operation.targetId !== 'active-sermon') throw new Error('A sermon activation requires the exact active-sermon record.')
    if (!payload.draftId || !/^[a-f0-9]{64}$/.test(payload.sourceHash)) throw new Error('A sermon activation requires the exact retained draft and source fingerprint.')
    let candidate
    try { candidate=JSON.parse(payload.candidateJson) } catch { throw new Error('The reviewed sermon candidate is not valid JSON.') }
    if (candidate?.id !== payload.draftId || candidate?.sourceHash !== payload.sourceHash || !Number.isInteger(Number(candidate?.baseActiveVersion)) || !candidate?.sermonNotes || !candidate?.formation) throw new Error('The retained sermon candidate does not match the reviewed source and active version.')
  }
  if (type === 'household.schedule.block.create') {
    if (!payload.title || !payload.startTime || !payload.endTime) throw new Error('A household time block requires a title and exact start and end times.')
    if (payload.date !== operation.targetDate) throw new Error('A household time block date must match the exact reviewed date.')
  }
  if (type === 'household.schedule.routine.create' && (!payload.title || !payload.startTime || !payload.endTime || !payload.days?.length)) throw new Error('A household routine requires a title, at least one day, and exact start and end times.')
  if (type === 'household.schedule.occurrence.update') {
    if (payload.date !== operation.targetDate) throw new Error('A household routine occurrence requires the exact reviewed date.')
    if (!payload.cancelled && (!payload.startTime || !payload.endTime)) throw new Error('A changed routine occurrence requires exact start and end times.')
  }
  if (type === 'household.maintenance.coverage.update' && payload.coveredBy && !HOUSEHOLD_MEMBERS.includes(payload.coveredBy)) throw new Error('Household coverage requires a recognized member.')
  if ((type === 'household.maintenance.chore.create' || type === 'household.maintenance.chore.update') && (!payload.title || !payload.date || !payload.owners?.length)) throw new Error('A household chore requires a title, date, and at least one owner.')
  if (type === 'household.maintenance.completion.update' && payload.action === 'return' && !payload.reason) throw new Error('Returning a household responsibility requires a reviewed reason.')
  if (type === 'household.inventory.item.create') {
    if (!payload.name) throw new Error('An inventory item requires a name.')
    if (['quantity', 'parLevel', 'unitCost'].some(field => payload[field] === undefined || payload[field] < 0)) throw new Error('Inventory quantity, reorder level, and unit cost must be non-negative numbers.')
  }
  if (type === 'household.inventory.quantity.update' && (!Number.isFinite(payload.delta) || payload.delta === 0)) throw new Error('An inventory adjustment requires a non-zero quantity change.')
  if (type === 'household.inventory.waste.create') {
    if (!operation.targetId) throw new Error('Inventory waste requires the exact affected item.')
    if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) throw new Error('Inventory waste requires a positive reviewed quantity.')
  }
  if (type === 'debt.create' || type === 'debt.update') {
    if (type === 'debt.create' && !payload.creditor) throw new Error('A debt requires a creditor.')
    for (const field of ['originalBalance','currentBalance','interestRate','fixedInterestAmount','minimumPayment']) if (payload[field] !== undefined && (!Number.isFinite(payload[field]) || payload[field] < 0)) throw new Error('Debt balances, rates, interest amounts, and minimum payments must be non-negative numbers.')
    if (payload.interestRate !== undefined && payload.interestRate > 100) throw new Error('Debt APR must be between 0 and 100 percent.')
    if (payload.paymentsPerYear !== undefined && (!Number.isInteger(payload.paymentsPerYear) || payload.paymentsPerYear < 1 || payload.paymentsPerYear > 365)) throw new Error('Debt payments per year must be a whole number from 1 through 365.')
    if (payload.dueDay !== undefined && payload.dueDay !== 0 && (!Number.isInteger(payload.dueDay) || payload.dueDay < 1 || payload.dueDay > 31)) throw new Error('Debt due day must be from 1 through 31.')
  }
  if (type === 'debt.transaction.apply') {
    if (!operation.targetId || !payload.transactionId || !payload.transactionName || !isDate(payload.transactionDate)) throw new Error('Applying bank activity to debt requires the exact debt and posted transaction details.')
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) throw new Error('A debt payment must be a positive posted amount.')
    if (!Number.isFinite(payload.nonPrincipalAmount) || payload.nonPrincipalAmount < 0 || payload.nonPrincipalAmount > payload.amount) throw new Error('Escrow, fees, and other non-principal amounts must be between zero and the payment total.')
    if(payload.paymentRule){
      const rule=payload.paymentRule
      if(rule.enabled!==true||!String(rule.matchText||'').trim())throw new Error('A debt payment rule requires exact match text.')
      if(!['originalStatement','merchantName'].includes(rule.matchField)||!['contains','starts','exactly'].includes(rule.matchMode))throw new Error('Choose a supported debt payment rule field and match method.')
      if(!Number.isFinite(Number(rule.nonPrincipalAmount))||Number(rule.nonPrincipalAmount)<0)throw new Error('A debt payment rule requires a non-negative non-principal amount.')
    }
  }
  if (type === 'calendar.create' && !isDate(payload.date || operation.targetDate)) throw new Error('A new calendar event requires an exact date.')
  if (type.startsWith('calendar.') && payload.allDay === false && !payload.time) throw new Error('A timed calendar event requires an exact time.')
  if (type.startsWith('calendar.') && payload.time && payload.allDay !== false) throw new Error('A calendar time requires allDay to be explicitly set to false.')
  if (type === 'transaction.categorize' && !payload.category) throw new Error('A transaction category is required.')
  if (type === 'transaction.update' && !operation.targetId) throw new Error('A transaction update requires the exact bank transaction id.')
  if (type === 'transaction.update' && !Object.keys(payload).some(field=>['name','category'].includes(field))) throw new Error('A transaction update requires a reviewed name or category change.')
  if (type === 'project.create' && !payload.title) throw new Error('A new project requires a title.')
  if ((type === 'meeting.action.create'||type === 'meeting.action.update') && ('text' in payload||type.endsWith('.create')) && !payload.text) throw new Error('A Finance Meeting commitment requires text.')
  if ((type === 'meeting.correction.create'||type === 'meeting.correction.update') && ('label' in payload||type.endsWith('.create')) && !payload.label) throw new Error('A Finance Meeting correction requires a name.')
  if(type==='meeting.session.create'){
    const hasContent=Boolean(payload.summary||payload.notes||payload.transcript||payload.actions?.length||payload.corrections?.length)
    if(!hasContent)throw new Error('A saved Finance Meeting requires notes, a transcript, or at least one reviewed update.')
  }
  if(type==='meeting.workspace.update'){
    const fields=Object.keys(payload)
    const snapshotFields=['monthStatus','expenseFocus']
    const hasSnapshot=fields.some(field=>snapshotFields.includes(field))
    const hasCadenceNote=['cadence','noteIndex','note'].some(field=>field in payload)
    if(hasSnapshot&&hasCadenceNote)throw new Error('Review a Finance Meeting snapshot change separately from a cadence note.')
    if(hasSnapshot&&operation.targetId!=='snapshot')throw new Error('A Finance Meeting snapshot change requires the exact snapshot record.')
    if(hasCadenceNote&&operation.targetId!=='cadence-notes')throw new Error('A Finance Meeting cadence note requires the exact cadence-notes record.')
    if(hasSnapshot&&fields.some(field=>!snapshotFields.includes(field)))throw new Error('That Finance Meeting snapshot change contains unrelated fields.')
    if(hasCadenceNote&&(!payload.cadence||!Number.isInteger(payload.noteIndex)||payload.noteIndex<0||payload.noteIndex>3||typeof payload.note!=='string'))throw new Error('A Finance Meeting cadence note requires a cadence, note position, and text.')
    if(!hasSnapshot&&!hasCadenceNote)throw new Error('Choose a supported Finance Meeting guidance field to update.')
  }
  if (type === 'transaction.rule.create' && (!payload.matchText || !payload.category || !isDate(payload.createdDate))) throw new Error('A future categorization rule requires match text, a category, and a YYYY-MM-DD start date.')
  if (type === 'transaction.rule.delete' && !operation.targetId) throw new Error('Removing a categorization rule requires its exact id.')
  if (type === 'budget.update') {
    if (!Number.isInteger(payload.month) || payload.month < 0 || payload.month > 11 || (payload.value === undefined && payload.amount === undefined)) throw new Error('A budget update requires a month from 0 through 11 and a numeric value.')
    if (!Number.isInteger(payload.year) || payload.year < 2000 || payload.year > 2100) throw new Error('A budget update requires an exact year from 2000 through 2100.')
    if (!payload.lineId || operation.targetId !== payload.lineId || !payload.accountId) throw new Error('A budget update requires the exact stable line and account ids.')
    if (!['income', 'expense'].includes(payload.direction)) throw new Error('A budget update requires an income or expense direction.')
  }
  if (type === 'forecast.update' && !operation.targetId) throw new Error('A forecast update requires the exact scenario id, or model for the shared planning expense.')
  if (type === 'finance.account.link' && (!operation.targetId || !payload.plaidAccountId)) throw new Error('A bank-source link requires the exact Brevity account and returned bank account ids.')
  if (type === 'recurring.create') {
    const required = ['title', 'amount', 'frequency', 'transactionType', 'accountId']
    if (required.some(field => payload[field] === undefined || payload[field] === '')) throw new Error('A scheduled transaction requires a name, amount, type, frequency, account, and exact date.')
    if (payload.date && payload.date !== operation.targetDate) throw new Error('A new scheduled transaction date must match the exact reviewed date.')
  }
  if (type === 'recurring.create' || type === 'recurring.update') {
    if (payload.amount !== undefined && payload.amount < 0) throw new Error('A scheduled transaction amount cannot be negative.')
    const effectiveDate = payload.date || operation.targetDate
    if (payload.endDate && effectiveDate && payload.endDate < effectiveDate) throw new Error('A scheduled transaction end date cannot be before its effective date.')
    if (payload.frequency === 'once' && payload.endDate && payload.endDate !== effectiveDate) throw new Error('A one-time scheduled transaction must end on its effective date.')
    if (payload.transactionType === 'transfer' && !payload.transferAccountId) throw new Error('A scheduled transfer requires a destination account.')
    if (payload.transactionType === 'transfer' && payload.category && payload.category !== 'Transfer') throw new Error('A scheduled transfer must use the Transfer category.')
    if (payload.transactionType && payload.transactionType !== 'transfer' && payload.transferAccountId) throw new Error('Only a forecast-only planned transfer can include a destination account.')
    if (payload.accountId && payload.transferAccountId && payload.accountId === payload.transferAccountId) throw new Error('A scheduled transfer requires different source and destination accounts.')
  }
  if(type==='meal.substitute'){
    if(!MEAL_TYPES.includes(payload.mealType))throw new Error('Choose breakfast, lunch or dinner for the meal substitution.')
    const meal=MEALS_BY_ID.get(payload.mealId)
    const customType=/^custom-(breakfast|lunch|dinner)-[a-zA-Z0-9-]+$/.exec(String(payload.mealId||''))?.[1]
    if(!meal&&customType!==payload.mealType)throw new Error('Choose a meal from the household meal library.')
    if(meal&&meal.mealType!==payload.mealType)throw new Error(`The selected meal is not a ${payload.mealType} option.`)
  }
  if (type === 'forecast.update') {
    const modelFields = ['planningExpense', 'expenseMode']
    const scenarioFields = ['title', 'description']
    const incomeFields = ['description', 'monthlyNet', 'annualGross', 'contribution', 'remote', 'employment', 'notes']
    const fields = Object.keys(payload)
    if (['model', 'planningExpense', 'expenseMode'].includes(operation.targetId)) {
      if (fields.some(field => !modelFields.includes(field))) throw new Error('A forecast model update can change only planningExpense or expenseMode.')
    } else if (payload.incomeAction === 'create') {
      if (!payload.incomeId || !payload.description || fields.some(field => !['incomeAction', 'incomeId', ...incomeFields].includes(field))) throw new Error('Adding forecast income requires a unique id, description, and supported income fields.')
    } else if (payload.incomeAction === 'delete') {
      if (!payload.incomeId || fields.some(field => !['incomeAction', 'incomeId'].includes(field))) throw new Error('Removing forecast income requires only its exact income id.')
    } else if (payload.incomeId) {
      if (!fields.some(field => incomeFields.includes(field)) || fields.some(field => !['incomeId', ...incomeFields].includes(field))) throw new Error('A forecast income update requires at least one supported reviewed income change.')
    } else {
      if (fields.some(field => !scenarioFields.includes(field))) throw new Error('A forecast income update requires an exact incomeId.')
      if (!fields.some(field => scenarioFields.includes(field))) throw new Error('A forecast scenario update requires a title or description change.')
    }
  }
  return operation
}

export function normalizeActionProposal(input = {}, { member, role = 'member', now = new Date(), id = randomUUID() } = {}) {
  const operations = (Array.isArray(input.operations) ? input.operations : []).slice(0, MAX_OPERATIONS).map(normalizeActionOperation)
  if (!operations.length) throw new Error('The assistant did not identify a supported Brevity action.')
  if (operations.filter(operation => operation.domain === 'calendar').length > 1) throw new Error('For safety, each Family Calendar confirmation can change only one event.')
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
  if (operation.type?.startsWith('household.')) {
    if (role !== 'admin' && !permissions?.[operation.domain]) return { allowed:false, reason:`${operation.domain} actions are not enabled for ${member}.` }
    return householdPermissionForOperation({ operation, member, role, currentRecord })
  }
  if (role === 'admin') return { allowed:true }
  if (['meeting.action.create','meeting.action.update','meeting.session.create','meeting.history.update'].includes(operation.type)) {
    if (!permissions?.planning) return { allowed:false, reason:`planning actions are not enabled for ${member}.` }
    if (operation.type === 'meeting.action.create' && String(operation.payload?.financialEffect || '').trim()) {
      return { allowed:false, reason:'Financial-effect details in Finance Meetings require household-administrator review.' }
    }
    if (operation.type === 'meeting.session.create') {
      if (operation.payload?.corrections?.length) return { allowed:false, reason:'Proposed financial corrections require household-administrator review and cannot be included in a member meeting update.' }
      if ((operation.payload?.actions || []).some(item => String(item.financialEffect || '').trim())) return { allowed:false, reason:'Financial-effect details in Finance Meetings require household-administrator review.' }
    }
    return { allowed:true }
  }
  if (!permissions?.[operation.domain]) return { allowed:false, reason:`${operation.domain} actions are not enabled for ${member}.` }
  if (operation.domain === 'finance') return { allowed:false, reason:'Financial administration requires household-administrator access.' }
  if (operation.type === 'plan.overview.update') return { allowed:false, reason:'Replacing a generated daily-plan overview requires household-administrator access.' }
  if (operation.type === 'plan.pillar.update' && operation.payload?.pillar === 'finance') return { allowed:false, reason:'Changing the daily financial plan requires household-administrator access.' }
  if (operation.type.startsWith('plan.')) return { allowed:true }
  if (operation.type.endsWith('.delete')) return { allowed:false, reason:'Deletion requires household-administrator access.' }
  const memberList = value => Array.isArray(value) ? value.filter(name => HOUSEHOLD_MEMBERS.includes(name)) : []
  const authorizedMembers = [...new Set([
    HOUSEHOLD_MEMBERS.includes(currentRecord?.owner) ? currentRecord.owner : null,
    ...memberList(currentRecord?.participants),
    ...memberList(currentRecord?.raci?.responsible),
    ...memberList(currentRecord?.raci?.accountable),
  ].filter(Boolean))]
  if (operation.type.includes('update')) {
    if (currentRecord?.owner !== 'Family' && !authorizedMembers.length) return { allowed:false, reason:'This record has no owner, participant, responsible member, or accountable member. An administrator must assign ownership before a member can update it.' }
    if (currentRecord?.owner !== 'Family' && !authorizedMembers.includes(member)) return { allowed:false, reason:`${member} can update only records they own, participate in, or hold responsible/accountable RACI authority for.` }
  }
  if (operation.type.endsWith('.create')) {
    if (operation.payload?.owner && ![member, 'Family'].includes(operation.payload.owner)) return { allowed:false, reason:`${member} cannot create work owned solely by another member.` }
    const proposedRaciAuthority = [...new Set([
      ...memberList(operation.payload?.raci?.responsible),
      ...memberList(operation.payload?.raci?.accountable),
    ])]
    if (operation.type === 'project.create' && !proposedRaciAuthority.includes(member)) return { allowed:false, reason:`${member} must be responsible or accountable for a project they create.` }
    if (proposedRaciAuthority.length && !proposedRaciAuthority.includes(member)) return { allowed:false, reason:`${member} cannot create work assigned solely to other responsible or accountable members.` }
  }
  return { allowed:true }
}

export function selectedOperation(operation, selectedScope) {
  const scope = operation.allowedScopes.includes(selectedScope) ? selectedScope : operation.defaultScope
  return { ...operation, selectedScope:scope, risk:actionRisk(operation.type, scope) }
}
