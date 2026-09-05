import { fetchICloudCalendarEvents } from '../family/icloudCalendarApi.js'
import { mergeCalendarEventsIntoPlan } from '../family/calendarOverlay.js'
import { stampCalendarFailure, stampCalendarSuccess } from '../family/calendarSnapshot.js'
import { refreshFinanceData } from '../finance/financeRefresh.js'
import { fetchDailyPlan } from './householdApi.js'
import { retryRefresh } from './retry.js'
import { fetchSystemHealth, systemHealthIssues } from './systemHealth.js'

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

export function buildRefreshIssues({ financeResult, planResult, calendar, healthResult }) {
  const issues = []
  ;(financeResult.status === 'fulfilled' ? financeResult.value?.errors || [] : [financeResult.reason?.message || 'Finance data could not be refreshed.'])
    .forEach(message => issues.push({ id:`finance-${issues.length}`, source:'Finance & Plaid', message:String(message), action:'Open Finance > Accounts only if this persists after Brevity retries automatically.' }))
  if (planResult.status === 'rejected') issues.push({ id:'today-plan', source:'Today', message:planResult.reason?.message || 'Today’s household plan could not be refreshed.', action:'Your previously saved plan remains available. Brevity will retry automatically on the next foreground or connectivity event.' })
  if (calendar?.error) issues.push({ id:'family-calendar', source:'Family Calendar', message:String(calendar.error), action:'Your last verified calendar remains visible. Brevity will retry automatically; review Family Calendar only if the issue persists.' })
  if (healthResult?.status === 'fulfilled') issues.push(...systemHealthIssues(healthResult.value))
  else if (healthResult?.status === 'rejected') issues.push({id:'system-health',source:'Brevity System Health',message:healthResult.reason?.message||'Integration health could not be verified.',action:'Brevity will retry health verification on the next application refresh.'})
  return Array.from(new Map(issues.map(issue=>[`${issue.source}:${issue.message}`,issue])).values())
}

async function runApplicationRefresh({ currentMember = 'Larry' } = {}) {
  const date = todayKey()
  const financePromise = retryRefresh(()=>refreshFinanceData())
  const planPromise = retryRefresh(()=>fetchDailyPlan(date))
  const healthPromise = retryRefresh(()=>fetchSystemHealth())
  const calendarPromise = retryRefresh(()=>fetchICloudCalendarEvents())
    .then(calendar => publishCalendarSnapshot(stampCalendarSuccess(calendar)))
    .catch(error => publishCalendarSnapshot(stampCalendarFailure(readCalendarCache(), error)))

  const [financeResult, planResult, healthResult] = await Promise.allSettled([financePromise, planPromise, healthPromise])
  const plan = planResult.status === 'fulfilled' ? planResult.value : null
  const calendar = await calendarPromise
  const calendarAwarePlan = plan?.date && !calendar?.error ? mergeCalendarEventsIntoPlan(plan, calendar.events) : plan
  const issues = buildRefreshIssues({ financeResult, planResult, calendar, healthResult })

  const detail = {
    date,
    finance: financeResult.status === 'fulfilled' ? financeResult.value : null,
    plan: calendarAwarePlan,
    analyses: [],
    calendar,
    health: healthResult.status === 'fulfilled' ? healthResult.value : null,
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
