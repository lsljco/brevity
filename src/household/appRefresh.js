import { fetchICloudCalendarEvents } from '../family/icloudCalendarApi.js'
import { mergeCalendarEventsIntoPlan } from '../family/calendarOverlay.js'
import { stampCalendarFailure, stampCalendarSuccess } from '../family/calendarSnapshot.js'
import { refreshFinanceData } from '../finance/financeRefresh.js'
import { fetchDailyPlan } from './householdApi.js'

export const APP_REFRESH_EVENT = 'brevity-app-refreshed'
export const ICLOUD_CACHE_KEY = 'brevity_icloud_calendar_cache_v1'

const todayKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

let activeRefresh = null

const readCalendarCache = () => {
  try { return JSON.parse(localStorage.getItem(ICLOUD_CACHE_KEY) || 'null') }
  catch { return null }
}

const publishCalendarSnapshot = snapshot => {
  localStorage.setItem(ICLOUD_CACHE_KEY, JSON.stringify(snapshot))
  window.dispatchEvent(new CustomEvent('brevity-icloud-calendar-refreshed', { detail: snapshot }))
  return snapshot
}

export function buildRefreshIssues({ financeResult, planResult, calendar }) {
  const issues = []
  ;(financeResult.status === 'fulfilled' ? financeResult.value?.errors || [] : [financeResult.reason?.message || 'Finance data could not be refreshed.'])
    .forEach(message => issues.push({ id:`finance-${issues.length}`, source:'Finance & Plaid', message:String(message), action:'Retry the refresh or open Finance > Accounts to review the connection.' }))
  if (planResult.status === 'rejected') issues.push({ id:'today-plan', source:'Today', message:planResult.reason?.message || 'Today’s household plan could not be refreshed.', action:'Retry the refresh. Your previously saved plan remains available.' })
  if (calendar?.error) issues.push({ id:'family-calendar', source:'Family Calendar', message:String(calendar.error), action:'Retry the refresh or open Family Calendar to review its connection status.' })
  return issues
}

async function runApplicationRefresh({ currentMember = 'Larry' } = {}) {
  const date = todayKey()
  const financePromise = refreshFinanceData()
  const planPromise = fetchDailyPlan(date)
  const calendarPromise = fetchICloudCalendarEvents()
    .then(calendar => publishCalendarSnapshot(stampCalendarSuccess(calendar)))
    .catch(error => publishCalendarSnapshot(stampCalendarFailure(readCalendarCache(), error)))

  const [financeResult, planResult] = await Promise.allSettled([financePromise, planPromise])
  const plan = planResult.status === 'fulfilled' ? planResult.value : null
  const calendar = await calendarPromise
  const calendarAwarePlan = plan?.date && !calendar?.error ? mergeCalendarEventsIntoPlan(plan, calendar.events) : plan
  const issues = buildRefreshIssues({ financeResult, planResult, calendar })

  const detail = {
    date,
    finance: financeResult.status === 'fulfilled' ? financeResult.value : null,
    plan: calendarAwarePlan,
    analyses: [],
    calendar,
    issues,
    refreshedAt: new Date().toISOString(),
  }
  window.dispatchEvent(new CustomEvent(APP_REFRESH_EVENT, { detail }))
  return detail
}

export function refreshApplicationData(options = {}) {
  if (activeRefresh) return activeRefresh
  activeRefresh = runApplicationRefresh(options).finally(() => { activeRefresh = null })
  return activeRefresh
}
