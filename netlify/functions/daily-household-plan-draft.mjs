import { getStore } from '@netlify/blobs'
import householdAuth from './household-auth.js'
import { readDailyPlanDraft } from '../lib/household-plan-generator.mjs'

const { readSession } = householdAuth
const json = (status, body) => new Response(JSON.stringify(body), { status, headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' } })

export default async function handler(request) {
  if (request.method !== 'GET') return json(405, { error:'Method not allowed.' })
  const cookie = request.headers.get('cookie') || ''
  const session = await readSession({ headers:{ cookie } }).catch(() => null)
  if (!session) return json(401, { error:'Sign in to review a generated daily-plan draft.' })
  if (session.role !== 'admin') return json(403, { error:'Generated whole-plan drafts include protected financial planning and require household-administrator review.' })
  const url = new URL(request.url)
  const date = url.searchParams.get('date') || ''
  const requestId = url.searchParams.get('requestId') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-zA-Z0-9_-]{1,120}$/.test(requestId)) return json(400, { error:'A valid draft date and request id are required.' })
  const dataStore = getStore({ name:'brevity-household', consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
  const draft = await readDailyPlanDraft(dataStore, date, requestId)
  return draft ? json(200, { draft }) : json(404, { state:'pending' })
}

export const config = { path:'/.netlify/functions/daily-household-plan-draft' }
