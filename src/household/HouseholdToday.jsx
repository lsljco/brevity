import { useEffect, useMemo, useState } from 'react'
import { reconcilePlanWithICloud } from '../family/calendarSync.js'
import { calendarAppointmentsForPlan } from '../family/calendarOverlay.js'
import { calendarSnapshotHealth } from '../family/calendarSnapshot.js'
import { useRollingMealPlan } from '../meals/useRollingMealPlan.js'
import EveningRecap from './EveningRecap.jsx'
import MorningAlignment from './MorningAlignment.jsx'
import TodayDashboard from './TodayDashboard.jsx'
import TomorrowProposal from './TomorrowProposal.jsx'
import { generateDailyPlan } from './dailyPlanGeneratorApi.js'
import { clearPillarAnalyses } from './pillarAnalysisApi.js'
import { useDailyPlan } from './useDailyPlan.js'
import { ICLOUD_CACHE_KEY } from './appRefresh.js'
import './HouseholdOS.css'

const cachedCalendar = () => {
  try { return JSON.parse(localStorage.getItem(ICLOUD_CACHE_KEY) || 'null') }
  catch { return null }
}

export default function HouseholdToday({ currentMember = 'Larry', onOpenPillar, onOpenMealPlan, onOpenCalendar }) {
  const { plan, state, error, reload, savePlan } = useDailyPlan()
  const mealPlan = useRollingMealPlan()
  const [mode, setMode] = useState('today')
  const [calendarMessage, setCalendarMessage] = useState('')
  const [generationState, setGenerationState] = useState('idle')
  const [generationMessage, setGenerationMessage] = useState('')
  const [calendarData, setCalendarData] = useState(cachedCalendar)
  const planWithMeals = useMemo(() => {
    const mealDay = mealPlan.data?.days?.find(day => day.date === plan.date)
    if (!mealDay) return plan
    return {
      ...plan,
      health: {
        ...plan.health,
        breakfast: mealDay.resolvedMeals.breakfast?.name || plan.health.breakfast,
        lunch: mealDay.resolvedMeals.lunch?.name || plan.health.lunch,
        dinner: mealDay.resolvedMeals.dinner?.name || plan.health.dinner,
        mealPlanSource: 'rolling',
        mealPlanVersion: mealDay.version,
      },
    }
  }, [mealPlan.data, plan])
  const calendarAppointments = useMemo(
    () => calendarAppointmentsForPlan(planWithMeals, calendarData?.events),
    [calendarData?.events, planWithMeals],
  )
  const calendarHealth = useMemo(() => calendarSnapshotHealth(calendarData), [calendarData])

  useEffect(() => {
    const receiveCalendar = event => setCalendarData(event.detail || null)
    window.addEventListener('brevity-icloud-calendar-refreshed', receiveCalendar)
    return () => window.removeEventListener('brevity-icloud-calendar-refreshed', receiveCalendar)
  }, [])

  const persistAndSync = async nextPlan => {
    const saved = await savePlan(nextPlan)
    clearPillarAnalyses(saved.date)
    try {
      const summary = await reconcilePlanWithICloud(saved)
      const changed = summary.created + summary.updated + summary.deleted
      setCalendarMessage(changed ? `Apple Calendar synchronized: ${summary.created} created · ${summary.updated} updated · ${summary.deleted} removed.` : 'Apple Calendar already matched Brevity.')
    } catch (calendarError) {
      if (calendarError.status === 401) setCalendarMessage('Brevity saved the household plan. Apple Calendar is locked on this device, so calendar sync was skipped.')
      else if (calendarError.status === 503) setCalendarMessage('Brevity saved the household plan. Apple Calendar is not configured yet, so calendar sync was skipped.')
      else setCalendarMessage(`Brevity saved the household plan. Calendar sync needs attention: ${calendarError.message}`)
    }
    return saved
  }

  const generatePlan = async () => {
    setGenerationState('generating')
    setGenerationMessage('Brevity is preparing the Seven Pillars Household Command Schedule…')
    try {
      await generateDailyPlan(plan.date, { overwrite: true })
      clearPillarAnalyses(plan.date)
      await reload()
      setGenerationState('ready')
      setGenerationMessage('Daily command plan generated and saved to Brevity.')
    } catch (generationError) {
      setGenerationState('error')
      setGenerationMessage(generationError.message || 'Could not generate the daily command plan.')
    }
  }

  const completeAlignment = async nextPlan => { await persistAndSync(nextPlan); setMode('today') }
  const completeRecap = async nextPlan => {
    const saved = await savePlan(nextPlan)
    clearPillarAnalyses(saved.date)
    setMode('tomorrow')
  }

  if (mode === 'alignment') return <MorningAlignment plan={planWithMeals} onOpenMealPlan={onOpenMealPlan} onSaveDraft={savePlan} onCancel={() => setMode('today')} onComplete={completeAlignment} />
  if (mode === 'recap') return <EveningRecap plan={planWithMeals} onCancel={() => setMode('today')} onComplete={completeRecap} />
  if (mode === 'tomorrow') return <div className="evening-recap"><header className="morning-alignment-header"><div><span>Tomorrow</span><h1>Prepare the Next Day</h1><p>Today is closed. Review a proposed brief only if it helps the household prepare intentionally.</p></div><button type="button" onClick={() => setMode('today')}>Return to Today</button></header><TomorrowProposal plan={planWithMeals} /></div>

  return <div className="household-today-workspace">
    {error && <div className="today-sync-banner today-sync-banner--error"><div><strong>Household sync needs attention</strong><span>{error}</span></div><button onClick={reload}>Retry</button></div>}
    {state === 'loading' && <div className="today-sync-banner"><i className="ti ti-cloud-download" /> Loading the shared household plan…</div>}
    {state === 'saving' && <div className="today-sync-banner"><i className="ti ti-cloud-upload" /> Saving household changes…</div>}
    {generationMessage && <div className={`today-sync-banner${generationState === 'error' ? ' today-sync-banner--error' : ''}`}><i className="ti ti-sparkles" /> {generationMessage}</div>}
    {calendarMessage && <div className="today-sync-banner"><i className="ti ti-calendar-check" /> {calendarMessage}</div>}
    {mealPlan.error && <div className="today-sync-banner today-sync-banner--error"><div><strong>Rolling meal plan needs attention</strong><span>{mealPlan.error}</span></div><button onClick={() => mealPlan.reload().catch(() => undefined)}>Retry</button></div>}
    <TodayDashboard plan={planWithMeals} calendarAppointments={calendarAppointments} calendarHealth={calendarHealth} currentMember={currentMember} onOpenPillar={onOpenPillar} onOpenCalendar={onOpenCalendar} onStartAlignment={() => setMode('alignment')} onStartRecap={() => setMode('recap')} onGeneratePlan={generatePlan} onSavePlan={persistAndSync} generationState={generationState} />
  </div>
}
