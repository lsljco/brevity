import { useEffect, useMemo, useRef, useState } from 'react'
import { calendarAppointmentsForPlan } from '../family/calendarOverlay.js'
import { calendarSnapshotHealth } from '../family/calendarSnapshot.js'
import { useRollingMealPlan } from '../meals/useRollingMealPlan.js'
import EveningRecap from './EveningRecap.jsx'
import MorningAlignment from './MorningAlignment.jsx'
import TodayDashboard from './TodayDashboard.jsx'
import TomorrowProposal from './TomorrowProposal.jsx'
import { fetchScheduledDailyPlanDraft, generateDailyPlan } from './dailyPlanGeneratorApi.js'
import { useDailyPlan } from './useDailyPlan.js'
import { ICLOUD_CACHE_KEY } from './appRefresh.js'
import { nextDailyPlanDate } from './alignmentDate.js'
import { assignmentUpdateOperation, buildAlignmentOperations, buildPlanDraftOperations, buildRecapOperations, decisionUpdateOperation, stageDailyPlanReview } from './dailyPlanActionReview.js'
import { clearLocalAlignmentDraft, clearLocalRecapDraft } from './dailyPlanLocalDraft.js'
import { ACTION_COMPLETED_EVENT } from '../assistant/actionEvents.js'
import { clearPillarAnalyses } from './pillarAnalysisCache.js'
import './HouseholdOS.css'

const cachedCalendar = () => {
  try { return JSON.parse(localStorage.getItem(ICLOUD_CACHE_KEY) || 'null') }
  catch { return null }
}

const applyRollingMeals = (plan, rollingPlan) => {
  const mealDay = rollingPlan?.days?.find(day => day.date === plan.date)
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
}

export default function HouseholdToday({ currentMember = 'Larry', canEditPlanning = true, planningAccessStatus = 'ready', isAdministrator = false, onOpenPillar, onOpenMealPlan, onOpenCalendar }) {
  const { plan, state, error, reload } = useDailyPlan()
  const alignmentDate = nextDailyPlanDate(plan.date)
  const {
    plan: alignmentPlan,
    state: alignmentState,
    error: alignmentError,
    reload: reloadAlignment,
  } = useDailyPlan(alignmentDate)
  const mealPlan = useRollingMealPlan({reloadOnRefreshEvents:true})
  const [mode, setMode] = useState('today')
  const [generationState, setGenerationState] = useState('idle')
  const [generationMessage, setGenerationMessage] = useState('')
  const [scheduledDraft, setScheduledDraft] = useState(null)
  const pendingPlanReviewRef = useRef(null)
  const [calendarData, setCalendarData] = useState(cachedCalendar)
  const planWithMeals = useMemo(() => applyRollingMeals(plan, mealPlan.data), [mealPlan.data, plan])
  const alignmentPlanWithMeals = useMemo(() => applyRollingMeals(alignmentPlan, mealPlan.data), [alignmentPlan, mealPlan.data])
  const todayMeals = useMemo(
    () => mealPlan.data?.days?.find(day => day.date === plan.date)?.resolvedMeals || {},
    [mealPlan.data, plan.date],
  )
  const calendarAppointments = useMemo(
    () => calendarAppointmentsForPlan(planWithMeals, calendarData?.events),
    [calendarData?.events, planWithMeals],
  )
  const calendarHealth = useMemo(() => calendarSnapshotHealth(calendarData), [calendarData])
  const planningAccessMessage = planningAccessStatus === 'loading'
    ? 'Brevity is verifying your Plans & decisions permission. Today remains view-only until that check finishes.'
    : planningAccessStatus === 'error'
      ? 'Brevity could not verify your Plans & decisions permission. Today remains view-only to protect the shared household plan.'
      : `${currentMember} can review Today, but changing or generating the shared plan requires Plans & decisions permission.`

  useEffect(() => {
    const receiveCalendar = event => setCalendarData(event.detail || null)
    window.addEventListener('brevity-icloud-calendar-refreshed', receiveCalendar)
    return () => window.removeEventListener('brevity-icloud-calendar-refreshed', receiveCalendar)
  }, [])

  useEffect(() => {
    let active=true
    if (!canEditPlanning || !isAdministrator || state !== 'ready') return () => { active=false }
    setScheduledDraft(null)
    fetchScheduledDailyPlanDraft(plan.date).then(draft => {
      if (!active || !draft || Number(draft.basePlanVersion) !== Number(plan.version || 0)) return
      setScheduledDraft(draft)
      setGenerationState('draft-ready')
      setGenerationMessage('A scheduled daily-plan draft is ready for your Action Mode review. The shared plan is unchanged.')
    }).catch(() => undefined)
    return () => { active=false }
  }, [canEditPlanning, isAdministrator, plan.date, plan.version, state])

  useEffect(() => {
    const completed = event => {
      const pending=pendingPlanReviewRef.current
      if (!pending || event?.detail?.proposalId !== pending.proposalId) return
      if (pending.kind === 'alignment') clearLocalAlignmentDraft(globalThis.localStorage, pending.date)
      if (pending.kind === 'recap') clearLocalRecapDraft(globalThis.localStorage, pending.date)
      if (pending.kind === 'generated') setScheduledDraft(null)
      clearPillarAnalyses(pending.date)
      pendingPlanReviewRef.current=null
      setMode(pending.kind === 'recap' ? 'tomorrow' : 'today')
    }
    window.addEventListener(ACTION_COMPLETED_EVENT, completed)
    return () => window.removeEventListener(ACTION_COMPLETED_EVENT, completed)
  }, [])

  const generatePlan = async () => {
    if (!canEditPlanning || !isAdministrator) {
      setGenerationState('error')
      setGenerationMessage(isAdministrator ? 'Plans & decisions permission is required to generate a daily-plan draft.' : 'Generated whole-plan drafts require household-administrator review. You can still propose granular alignment changes.')
      return
    }
    setGenerationState('generating')
    setGenerationMessage('Brevity is preparing a versioned Seven Pillars draft…')
    try {
      const generated = scheduledDraft || await generateDailyPlan(plan.date)
      const operations = buildPlanDraftOperations(plan, generated.draft)
      const proposal=await stageDailyPlanReview({ summary:`Review the generated daily-plan draft for ${plan.date}`, operations, expectedVersion:generated.basePlanVersion })
      pendingPlanReviewRef.current={proposalId:proposal.id,date:plan.date,kind:'generated'}
      setGenerationState('reviewing')
      setGenerationMessage('The generated draft is ready for Action Mode review. The shared plan has not changed.')
    } catch (generationError) {
      setGenerationState('error')
      setGenerationMessage(generationError.message || 'Could not generate the daily command plan.')
    }
  }

  const reviewAlignment = async (original, nextPlan, { expectedVersion, completedAt }, timingLabel) => {
    if (!canEditPlanning) throw new Error('Plans & decisions permission is required to close the shared daily plan.')
    const operations = buildAlignmentOperations(original, nextPlan, { completedAt })
    return stageDailyPlanReview({ summary:`Review ${timingLabel} for ${nextPlan.date}`, operations, expectedVersion })
  }
  const completeTodayAlignment = async (nextPlan, review) => { const proposal=await reviewAlignment(planWithMeals, nextPlan, review, 'Today’s Alignment'); pendingPlanReviewRef.current={proposalId:proposal.id,date:nextPlan.date,kind:'alignment'} }
  const completeAlignment = async (nextPlan, review) => { const proposal=await reviewAlignment(alignmentPlanWithMeals, nextPlan, review, 'Tomorrow’s Alignment'); pendingPlanReviewRef.current={proposalId:proposal.id,date:nextPlan.date,kind:'alignment'} }
  const completeRecap = async (recap, { expectedVersion, completedAt }) => {
    if (!canEditPlanning) throw new Error('Plans & decisions permission is required to close the shared daily plan.')
    const operations = buildRecapOperations(plan, recap, completedAt)
    const proposal=await stageDailyPlanReview({ summary:`Review the Evening Recap for ${plan.date}`, operations, expectedVersion })
    pendingPlanReviewRef.current={proposalId:proposal.id,date:plan.date,kind:'recap'}
  }

  const reviewDecision = async (decisionId, patch, expectedVersion) => stageDailyPlanReview({ summary:`Review a Today decision for ${plan.date}`, operations:[decisionUpdateOperation(plan, decisionId, patch)], expectedVersion })
  const reviewAssignment = async (assignmentId, patch, expectedVersion) => stageDailyPlanReview({ summary:`Review an assignment for ${plan.date}`, operations:[assignmentUpdateOperation(plan, assignmentId, patch)], expectedVersion })

  if (mode === 'today-alignment') return <MorningAlignment timing="today" plan={planWithMeals} readOnly={!canEditPlanning} readOnlyMessage={planningAccessMessage} financeReadOnly={!isAdministrator} onOpenMealPlan={onOpenMealPlan} onCancel={() => setMode('today')} onComplete={completeTodayAlignment} />
  if (mode === 'alignment' && alignmentState === 'loading') return <div className="household-today-workspace"><div className="today-sync-banner"><i className="ti ti-cloud-download" /> Loading tomorrow’s shared household plan…</div></div>
  if (mode === 'alignment' && alignmentError) return <div className="household-today-workspace"><div className="today-sync-banner today-sync-banner--error"><div><strong>Tomorrow’s plan could not be loaded</strong><span>{alignmentError}</span></div><button onClick={reloadAlignment}>Retry</button><button onClick={() => setMode('today')}>Return to Today</button></div></div>
  if (mode === 'alignment') return <MorningAlignment plan={alignmentPlanWithMeals} readOnly={!canEditPlanning} readOnlyMessage={planningAccessMessage} financeReadOnly={!isAdministrator} onOpenMealPlan={onOpenMealPlan} onCancel={() => setMode('today')} onComplete={completeAlignment} />
  if (mode === 'recap') return <EveningRecap plan={planWithMeals} readOnly={!canEditPlanning} readOnlyMessage={planningAccessMessage} onCancel={() => setMode('today')} onComplete={completeRecap} />
  if (mode === 'tomorrow') return <div className="evening-recap"><header className="morning-alignment-header"><div><span>Tomorrow</span><h1>Prepare the Next Day</h1><p>Today is closed. Review a proposed brief only if it helps the household prepare intentionally.</p></div><button type="button" onClick={() => setMode('today')}>Return to Today</button></header><TomorrowProposal plan={planWithMeals} targetPlan={alignmentPlan} readOnly={!isAdministrator} /></div>

  return <div className="household-today-workspace">
    {!canEditPlanning && <div className="today-sync-banner today-sync-banner--permission" role="status"><i className="ti ti-lock" aria-hidden="true" /><div><strong>Today is view-only for {currentMember}</strong><span>{planningAccessMessage}</span></div></div>}
    {error && <div className="today-sync-banner today-sync-banner--error"><div><strong>Household sync needs attention</strong><span>{error}</span></div><button onClick={reload}>Retry</button></div>}
    {state === 'loading' && <div className="today-sync-banner"><i className="ti ti-cloud-download" /> Loading the shared household plan…</div>}
    {generationMessage && <div className={`today-sync-banner${generationState === 'error' ? ' today-sync-banner--error' : ''}`}><i className="ti ti-sparkles" /> {generationMessage}</div>}
    {mealPlan.error && <div className="today-sync-banner today-sync-banner--error"><div><strong>Rolling meal plan needs attention</strong><span>{mealPlan.error}</span></div><button onClick={() => mealPlan.reload().catch(() => undefined)}>Retry</button></div>}
    <TodayDashboard plan={planWithMeals} meals={todayMeals} mealPlanState={mealPlan.state} mealPlanError={mealPlan.error} readOnly={!canEditPlanning} canGeneratePlan={isAdministrator} todayAlignmentCompleted={Boolean(plan.morningAlignment?.completedAt)} todayAlignmentUnavailable={state !== 'ready'} alignmentDate={alignmentDate} alignmentCompleted={Boolean(alignmentPlan.morningAlignment?.completedAt)} alignmentLoading={alignmentState === 'loading'} calendarAppointments={calendarAppointments} calendarHealth={calendarHealth} currentMember={currentMember} onOpenPillar={onOpenPillar} onOpenCalendar={onOpenCalendar} onOpenMealPlan={onOpenMealPlan} onStartTodayAlignment={() => setMode('today-alignment')} onStartAlignment={() => setMode('alignment')} onStartRecap={() => setMode('recap')} onGeneratePlan={generatePlan} onReviewDecision={reviewDecision} onReviewAssignment={reviewAssignment} generationState={generationState} />
  </div>
}
