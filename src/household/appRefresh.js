import { fetchICloudCalendarEvents } from '../family/icloudCalendarApi.js'
import { refreshFinanceData } from '../finance/financeRefresh.js'
import { PILLAR_IDS } from './dailyPlan.js'
import { fetchDailyPlan } from './householdApi.js'
import { generatePillarAnalysis } from './pillarAnalysisApi.js'

export const APP_REFRESH_EVENT = 'brevity-app-refreshed'
export const ICLOUD_CACHE_KEY = 'brevity_icloud_calendar_cache_v1'

const todayKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

let activeRefresh = null

async function runApplicationRefresh({ currentMember = 'Larry' } = {}) {
  const date = todayKey()
  const financePromise = refreshFinanceData()
  const planPromise = fetchDailyPlan(date)
  const calendarPromise = fetchICloudCalendarEvents()
    .then(calendar => {
      localStorage.setItem(ICLOUD_CACHE_KEY, JSON.stringify(calendar))
      window.dispatchEvent(new CustomEvent('brevity-icloud-calendar-refreshed', { detail: calendar }))
      return calendar
    })
    .catch(error => ({ error: error.message, status: error.status }))

  const [financeResult, planResult] = await Promise.allSettled([financePromise, planPromise])
  const plan = planResult.status === 'fulfilled' ? planResult.value : null
  const analyses = plan?.date
    ? await Promise.allSettled(PILLAR_IDS.map(pillar => generatePillarAnalysis({ pillar, date: plan.date, plan, currentMember, force: true })))
    : []
  const calendar = await calendarPromise

  const detail = {
    date,
    finance: financeResult.status === 'fulfilled' ? financeResult.value : null,
    plan,
    analyses,
    calendar,
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
