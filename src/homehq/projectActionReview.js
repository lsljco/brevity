import { prepareDirectAction } from '../assistant/assistantApi.js'
import { requestActionReview } from '../assistant/actionEvents.js'
import { getAcknowledgedSharedStateVersion } from '../household/sharedState.js'
import { normalizeProjectItem, PROJECT_STORAGE_KEY } from './projectData.js'

const PROJECT_TEXT_FIELDS = [
  'title', 'type', 'room', 'roomCustom', 'status', 'priority',
  'cname', 'cphone', 'cemail', 'caddress', 'notes',
]
const PROJECT_BOOLEAN_FIELDS = ['bizLicense', 'coi', 'workersComp']

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const quote = value => {
  const text=String(value || '').trim()
  return `“${text.slice(0, 80)}${text.length > 80 ? '…' : ''}”`
}

const projectCost = value => {
  if (value === '' || value === null || value === undefined) return ''
  const amount=Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Project costs must be non-negative numbers.')
  return amount.toFixed(2)
}

export function reviewedProjectPayload(item = {}) {
  const project=normalizeProjectItem(item)
  const payload={}
  PROJECT_TEXT_FIELDS.forEach(field => { payload[field]=String(project[field] || '').trim() })
  PROJECT_BOOLEAN_FIELDS.forEach(field => { payload[field]=Boolean(project[field]) })
  payload.date=String(project.startDate || '')
  payload.endDate=String(project.due || '')
  payload.estcost=projectCost(project.estcost)
  payload.actcost=projectCost(project.actcost)
  payload.raci=project.raci
  return payload
}

function changedProjectPayload(before, draft) {
  const previous=reviewedProjectPayload(before)
  const next=reviewedProjectPayload(draft)
  return Object.fromEntries(Object.entries(next).filter(([field, value]) => !same(previous[field], value)))
}

export function projectCreateOperation(draft) {
  const payload=reviewedProjectPayload(draft)
  if (!payload.title) throw new Error('Project title is required.')
  return {
    type:'project.create',
    targetId:'',
    payload,
    description:`Create project ${quote(payload.title)} with the reviewed project details and RACI assignments.`,
  }
}

export function projectUpdateOperation(before, draft) {
  if (!before?.id) throw new Error('The project record is no longer available. Refresh Projects and try again.')
  const payload=changedProjectPayload(before, draft)
  if (!Object.keys(payload).length) throw new Error('Change at least one project field before requesting review.')
  if ('title' in payload && !payload.title) throw new Error('Project title is required.')
  return {
    type:'project.update',
    targetId:before.id,
    payload,
    description:`Update project ${quote(before.title)}. Reviewed fields: ${Object.keys(payload).join(', ')}.`,
  }
}

export function projectDeleteOperation(project) {
  if (!project?.id) throw new Error('The project record is no longer available. Refresh Projects and try again.')
  return {
    type:'project.delete',
    targetId:project.id,
    payload:{},
    description:`Delete project ${quote(project.title)}.`,
  }
}

export async function requestProjectActionReview({ summary, operation, storage = localStorage }) {
  const expectedVersion=getAcknowledgedSharedStateVersion(storage, PROJECT_STORAGE_KEY)
  const result=await prepareDirectAction({ summary, operation, expectedVersion })
  if (!result?.proposal?.id) throw new Error('Action Mode did not return a reviewable project proposal.')
  requestActionReview(result.proposal)
  return result.proposal
}
