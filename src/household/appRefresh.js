import { fetchICloudCalendarEvents } from '../family/icloudCalendarApi.js'
import { mergeCalendarEventsIntoPlan } from '../family/calendarOverlay.js'
import { stampCalendarFailure, stampCalendarSuccess } from '../family/calendarSnapshot.js'
import { refreshFinanceData } from '../finance/financeRefresh.js'
import { getHouseholdDateKey } from '../finance/financeTime.js'
import { fetchDailyPlan } from './householdApi.js'
import { retryRefresh } from './retry.js'
import { fetchSystemHealth, systemHealthIssues } from './systemHealth.js'

export const APP_REFRESH_EVENT = 'brevity-app-refreshed'
export const ICLOUD_CACHE_KEY = 'brevity_icloud_calendar_cache_v1'

export const applicationRefreshDate = (now = new Date()) => getHouseholdDateKey(now)

let activeRefresh = null
// A page/app launch gets one automatic live-bank request for an administrator.
// Browser refreshes recreate this module, so the first application refresh after
// every open/reload requests Plaid again. Internal post-action refreshes do not
// repeatedly ask Plaid for a live update unless the caller explicitly requests it.
let automaticBankRefreshRequested = false

const readCalendarCache = () => {
  try { return JSON.parse(localStorage.getItem(ICLOUD_CACHE_KEY) || 'null') }
  catch { return null }
}

const publishCalendarSnapshot = snapshot => {
  localStorage.setItem(ICLOUD_CACHE_KEY, JSON.stringify(snapshot))
  window.dispatchEvent(new CustomEvent('brevity-icloud-calendar-refreshed', { detail: snapshot }))
  return snapshot
}

export function shouldRequestBankUpdate({ requestBankUpdate = false, financeReadOnly = false, automaticAlreadyRequested = false } = {}) {
  if (financeReadOnly) return false
  return Boolean(requestBankUpdate || !automaticAlreadyRequested)
}

export function buildBankRefreshState(finance, { requested = false, financeReadOnly = false } = {}) {
  const transactionRefresh = finance?.transactionRefresh || null
  const transactionStatus = finance?.transactionFreshness?.status || finance?.transactionDataStatus || 'unknown'
  const balanceStatus = finance?.balanceDataStatus || 'unknown'
  const lastSuccessfulAt = finance?.transactionFreshness?.lastFullSuccessAt || ''
  const balanceCheckedAt = finance?.balanceCheckedAt || ''

  if (financeReadOnly) return { requested:false, status:'read-only', transactionStatus, balanceStatus, lastSuccessfulAt, balanceCheckedAt }
  if (!requested) return { requested:false, status:'not-requested', transactionStatus, balanceStatus, lastSuccessfulAt, balanceCheckedAt }
  if (!finance) return { requested:true, status:'failed', transactionStatus, balanceStatus, lastSuccessfulAt, balanceCheckedAt }
  if (transactionRefresh?.stillProcessing) return { requested:true, status:'processing', transactionStatus, balanceStatus, lastSuccessfulAt, balanceCheckedAt }
  if (balanceStatus === 'disconnected') return { requested:true, status:'disconnected', transactionStatus, balanceStatus, lastSuccessfulAt, balanceCheckedAt }

  const errors = Array.isArray(finance.errors) ? finance.errors : []
  const balanceFresh = balanceStatus === 'fresh'
  const transactionsFresh = transactionStatus === 'fresh'
  if (!errors.length && balanceFresh && transactionsFresh) {
    return { requested:true, status:'fresh', transactionStatus, balanceStatus, lastSuccessfulAt, balanceCheckedAt }
  }
  return { requested:true, status:errors.length ? 'partial' : 'stale', transactionStatus, balanceStatus, lastSuccessfulAt, balanceCheckedAt }
}

export function buildRefreshIssues({ financeResult, planResult, calendar, healthResult, bankRefresh }) {
  const issues = []
  ;(financeResult.status === 'fulfilled' ? financeResult.value?.errors || [] : [financeResult.reason?.message || 'Finance data could not be refreshed.'])
    .forEach(message => issues.push({ id:`finance-${issues.length}`, source:'Finance & Plaid', message:String(message), action:'Open Finance > Accounts only if this persists after Brevity retries automatically.' }))

  if (bankRefresh?.requested && !['fresh','processing'].includes(bankRefresh.status) && !issues.some(issue => issue.source === 'Finance & Plaid')) {
    const lastSuccess = bankRefresh.lastSuccessfulAt && Number.isFinite(Date.parse(bankRefresh.lastSuccessfulAt))
      ? ` Last successful transaction sync: ${new Date(bankRefresh.lastSuccessfulAt).toLocaleString()}.`
      : ''
    const message = bankRefresh.status === 'disconnected'
      ? 'Brevity refreshed its application data, but no active Plaid bank connection was confirmed.'
      : 'Brevity refreshed its application data, but the live bank refresh did not fully complete.'
    issues.push({
      id:'finance-bank-refresh',
      source:'Finance & Plaid',
      message:`${message}${lastSuccess}`,
      action:'The prior verified bank snapshot remains visible. Use Finance > Accounts > Sync now only if the automatic retry does not recover.',
    })
  }

  if (planResult.status === 'rejected') issues.push({ id:'today-plan', source:'Today', message:planResult.reason?.message || 'Today’s household plan could not be refreshed.', action:'Your previously saved plan remains available. Brevity will retry automatically on the next foreground or connectivity event.' })
  if (calendar?.error) issues.push({ id:'family-calendar', source:'Family Calendar', message:String(calendar.error), action:'Your last verified calendar remains visible. Brevity will retry automatically; review Family Calendar only if the issue persists.' })
  if (healthResult?.status === 'fulfilled') issues.push(...systemHealthIssues(healthResult.value))
  else if (healthResult?.status === 'rejected') issues.push({id:'system-health',source:'Brevity System Health',message:healthResult.reason?.message||'Integration health could not be verified.',action:'Brevity will retry health verification on the next application refresh.'})
  return Array.from(new Map(issues.map(issue=>[`${issue.source}:${issue.message}`,issue])).values())
}

async function runApplicationRefresh({ currentMember = 'Larry', requestBankUpdate = false, financeReadOnly = false } = {}) {
  const date = applicationRefreshDate()
  const bankUpdateRequested = shouldRequestBankUpdate({
    requestBankUpdate,
    financeReadOnly,
    automaticAlreadyRequested:automaticBankRefreshRequested,
  })
  if (bankUpdateRequested && !requestBankUpdate) automaticBankRefreshRequested = true

  const financePromise = retryRefresh(()=>refreshFinanceData(window.localStorage,{ requestBankUpdate:bankUpdateRequested, persist:!financeReadOnly }))
  const planPromise = retryRefresh(()=>fetchDailyPlan(date))
  const healthPromise = retryRefresh(()=>fetchSystemHealth())
  const calendarPromise = retryRefresh(()=>fetchICloudCalendarEvents())
    .then(calendar => publishCalendarSnapshot(stampCalendarSuccess(calendar)))
    .catch(error => publishCalendarSnapshot(stampCalendarFailure(readCalendarCache(), error)))

  const [financeResult, planResult, healthResult] = await Promise.allSettled([financePromise, planPromise, healthPromise])
  // Let the next ordinary application refresh safely retry an automatic request
  // only when the finance operation itself failed after its bounded retries.
  if (bankUpdateRequested && !requestBankUpdate && financeResult.status === 'rejected') automaticBankRefreshRequested = false

  const plan = planResult.status === 'fulfilled' ? planResult.value : null
  const calendar = await calendarPromise
  const calendarAwarePlan = plan?.date && !calendar?.error ? mergeCalendarEventsIntoPlan(plan, calendar.events) : plan
  const finance = financeResult.status === 'fulfilled' ? financeResult.value : null
  const bankRefresh = buildBankRefreshState(finance, { requested:bankUpdateRequested, financeReadOnly })
  const issues = buildRefreshIssues({ financeResult, planResult, calendar, healthResult, bankRefresh })

  const detail = {
    date,
    finance,
    bankRefresh,
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
