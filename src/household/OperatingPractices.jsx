import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDailyPlan, currentDailyPlanDate } from './useDailyPlan.js'
import { fetchDailyPlan } from './householdApi.js'
import { useRollingMealPlan } from '../meals/useRollingMealPlan.js'
import { HOUSEHOLD_SCHEDULE_STORAGE_KEY, normalizeHouseholdScheduleState, scheduleForMember } from './householdScheduleData.js'
import { SHARED_STATE_EVENT, getAcknowledgedSharedStateVersion, syncSharedState } from './sharedState.js'
import { requestHouseholdActionReview, scheduleRoutineCreateOperation, scheduleRoutineUpdateOperation } from './householdActionReview.js'
import { stageDailyPlanReview } from './dailyPlanActionReview.js'
import { ACTION_COMPLETED_EVENT } from '../assistant/actionEvents.js'
import { PRACTICE_ADULTS, PRACTICE_MEALS, dailyPracticeCards, mealReadiness, practiceDayOperation, readPracticeDay, shiftPracticeDate, withPracticeCheckin } from './operatingPractices.js'
import { PracticeAgreementEditor, PracticeCheckinEditor, PracticeMealEditor, PracticeWeeklyEditor } from './PracticeEditors.jsx'
import './OperatingPractices.css'

const clone = value => JSON.parse(JSON.stringify(value))
const labelMeal = value => `${value[0].toUpperCase()}${value.slice(1)}`
function scheduleSnapshot() {
  try {
    const version = getAcknowledgedSharedStateVersion(localStorage, HOUSEHOLD_SCHEDULE_STORAGE_KEY)
    return { data: normalizeHouseholdScheduleState(JSON.parse(localStorage.getItem(HOUSEHOLD_SCHEDULE_STORAGE_KEY) || '{}')), version, ready: true, error: '' }
  } catch (error) { return { data: normalizeHouseholdScheduleState(), version: null, ready: false, error: error.message || 'The Schedule version could not be verified.' } }
}
function usePracticeSchedule() {
  const [snapshot, setSnapshot] = useState(() => ({ ...scheduleSnapshot(), ready: false }))
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true), syncing = useRef(false), verified = useRef(false)
  const reload = useCallback(async () => {
    if (syncing.current) return
    syncing.current = true
    setLoading(true)
    setSnapshot(previous => ({ ...previous, ready: false }))
    try {
      const result = await syncSharedState()
      if (result?.rejected?.length) throw result.rejected[0].reason || new Error('Household synchronization did not finish.')
      if (mounted.current) {
        const next = scheduleSnapshot()
        verified.current = next.ready
        setSnapshot(next)
      }
    } catch (error) {
      verified.current = false
      if (mounted.current) setSnapshot(value => ({ ...value, ready: false, error: error.message || 'Schedule synchronization is unavailable.' }))
    } finally {
      syncing.current = false
      if (mounted.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    reload()
    const receive = event => {
      if (!verified.current || syncing.current) return
      if (event.type === 'storage' && event.key && event.key !== HOUSEHOLD_SCHEDULE_STORAGE_KEY) return
      if (event.type === SHARED_STATE_EVENT && event.detail?.keys && !event.detail.keys.includes(HOUSEHOLD_SCHEDULE_STORAGE_KEY)) return
      setSnapshot(scheduleSnapshot())
    }
    window.addEventListener(SHARED_STATE_EVENT, receive)
    window.addEventListener('storage', receive)
    return () => { mounted.current = false; window.removeEventListener(SHARED_STATE_EVENT, receive); window.removeEventListener('storage', receive) }
  }, [reload])
  return { ...snapshot, loading, reload }
}

function WeeklyPracticeReview({ date, canEdit, onRecord, revision }) {
  const [result, setResult] = useState({ loading: true, days: [] })
  useEffect(() => {
    let active = true
    setResult({ loading: true, days: [] })
    const dates = Array.from({ length: 7 }, (_, index) => shiftPracticeDate(date, index - 6))
    Promise.all(dates.map(async day => {
      try {
        const plan = await fetchDailyPlan(day)
        if (!plan || plan.date !== day) throw new Error('The requested dated record was not returned.')
        return { date: day, ...readPracticeDay(plan), plan }
      } catch (error) { return { date: day, error: error.message || 'Daily record unavailable' } }
    })).then(days => { if (active) setResult({ loading: false, days }) })
    return () => { active = false }
  }, [date, revision])
  const records = result.days.filter(day => !day.error).flatMap(day => (day.data?.checkins || []).map(record => ({ ...record, date: day.date })))
  const counts = Object.fromEntries(['complete', 'blocked', 'exception', 'unrecorded'].map(status => [status, records.filter(record => record.status === status).length]))
  const missingDays = result.days.filter(day => !day.error && !day.data?.checkins.length).length
  const unavailable = result.days.filter(day => day.error)
  return <section className="practice-week" aria-label="Weekly practice review"><header><h3>Weekly review · {shiftPracticeDate(date, -6)} through {date}</h3><button type="button" disabled={!canEdit || result.loading} onClick={onRecord}>Record family review</button></header>
    <p>Reported practice, workload and recovery—not a score of anyone's worth. Missing records are not proof of noncompliance. A planned meal is not evidence it was eaten.</p>
    {result.loading ? <p role="status">Loading seven dated household records…</p> : <>
      <div className="practice-stats"><span><strong>{counts.complete}</strong> completions reported</span><span><strong>{counts.blocked}</strong> support needed</span><span><strong>{counts.exception}</strong> exceptions recorded</span><span><strong>{missingDays}</strong> dates with no check-ins</span></div>
      {counts.unrecorded > 0 && <p>{counts.unrecorded} check-in records explicitly remain unrecorded.</p>}
      {unavailable.length > 0 && <p role="alert">Partial review: records unavailable for {unavailable.map(day => day.date).join(', ')}. No full-week conclusion is shown.</p>}
      {records.length ? <ul className="practice-records">{records.map(record => <li key={`${record.date}:${record.routineId}`}><strong>{record.date} · {record.title}</strong><span>{record.owner} · Version {record.revision} · {record.status}</span>{record.note && <p>{record.note}</p>}{record.recovery && <p>Recovery: {record.recovery}</p>}</li>)}</ul> : <p>No check-in evidence is recorded in the available dates. Activate the agreements and begin with today's actual responsibilities.</p>}
      {result.days.filter(day => day.data?.review.completed).map(day => <article key={day.date} className="practice-review-note"><h4>Review recorded for {day.date}</h4><p>{day.data.review.notes}</p></article>)}
    </>}
  </section>
}

function ScheduleCoverage({ schedule, date, currentMember, plan, onNavigate }) {
  const [member, setMember] = useState(currentMember || 'Larry')
  const blocks = useMemo(() => scheduleForMember(schedule, date, member), [schedule, date, member])
  const assignments = (plan.assignments || []).filter(item => item.owner === member || item.participants?.includes(member))
  const conflicts = []
  for (let index = 0; index < blocks.length; index += 1) for (let other = index + 1; other < blocks.length; other += 1) {
    if (blocks[index].startTime < blocks[other].endTime && blocks[other].startTime < blocks[index].endTime) conflicts.push(`${blocks[index].title} / ${blocks[other].title}`)
  }
  return <section className="practice-coverage"><header><div><h3>Protected time and next actions</h3><p>Shared anchors, separate focus, and realistic coverage. Rest does not need to be justified as productivity.</p></div><button type="button" onClick={() => onNavigate?.('schedule')}>Review personal Schedule</button></header>
    <label className="practice-member"><span>Household member</span><select value={member} onChange={event => setMember(event.target.value)}>{[...PRACTICE_ADULTS, 'Isaiah'].map(name => <option key={name}>{name}</option>)}</select></label>
    {conflicts.length > 0 && <p className="practice-error">Overlapping saved Schedule blocks: {conflicts.join('; ')}. Check travel, work, study and backup coverage.</p>}
    {blocks.length ? <ol className="practice-blocks">{blocks.map(block => <li key={block.id}><time>{block.startTime}–{block.endTime}</time><div><strong>{block.title}</strong><span>{block.pillar}</span></div></li>)}</ol> : <p>No blocks are recorded here for {member} on this date. This is a planning gap to review—not evidence that the person is inactive.</p>}
    {assignments.length > 0 && <p>Daily Plan assignments: {assignments.map(item => `${item.title} (${item.status || 'unrecorded'})`).join(' · ')}</p>}
    <p className="practice-muted">This view uses the saved Household Schedule and Daily Plan. Check Family Calendar for external commitments before declaring the whole day conflict-free. For Isaiah, use age-appropriate responsibilities and a supporting adult.</p>
  </section>
}

export function OperatingPracticesPanel({ plan, planState = 'loading', planError = '', meals = {}, mealState = 'loading', currentMember, canEditPlanning = false, mode = 'daily', compact = false, onNavigate, onOpenPractices, onReload }) {
  const schedule = usePracticeSchedule()
  const [editor, setEditor] = useState(null), [notice, setNotice] = useState(''), [error, setError] = useState('')
  const [reviewRevision, setReviewRevision] = useState(0)
  const pending = useRef(null)
  const saved = readPracticeDay(plan)
  const cards = dailyPracticeCards(schedule.data, plan)
  const canEdit = canEditPlanning && planState === 'ready' && schedule.ready && !saved.error
  const close = useCallback(() => setEditor(null), [])
  useEffect(() => { setEditor(null); setError(''); setNotice('') }, [plan.date])
  useEffect(() => {
    const completed = event => {
      const ownProposal = pending.current && event.detail?.proposalId === pending.current
      const operations = event.detail?.audit?.operations || []
      const scheduleChanged = operations.some(operation => operation.type?.startsWith('household.schedule.'))
      if (!ownProposal && !scheduleChanged) return
      if (ownProposal) {
        pending.current = null
        setNotice('Reviewed change committed. Refreshing the authoritative records…')
        setReviewRevision(value => value + 1)
        onReload?.()
      }
      schedule.reload()
    }
    window.addEventListener(ACTION_COMPLETED_EVENT, completed)
    return () => window.removeEventListener(ACTION_COMPLETED_EVENT, completed)
  }, [onReload, schedule.reload])
  const open = (kind, details = {}) => {
    setError(''); setNotice('')
    try {
      if (!canEdit) throw new Error('Wait for verified source data and Plans & decisions permission before editing.')
      const scheduleVersion = getAcknowledgedSharedStateVersion(localStorage, HOUSEHOLD_SCHEDULE_STORAGE_KEY)
      setEditor({ kind, ...details, plan: clone(plan), scheduleVersion })
    } catch (failure) { setError(failure.message) }
  }
  const verifyEditor = () => {
    if (!editor || !canEdit || editor.plan.date !== plan.date) throw new Error('The date, permission or source state changed. Refresh and reopen this record.')
    if (Number(plan.version || 0) !== Number(editor.plan.version || 0)) throw new Error('This daily plan changed while the editor was open. Reopen it to review the current version.')
    if (['agreement', 'checkin'].includes(editor.kind) && getAcknowledgedSharedStateVersion(localStorage, HOUSEHOLD_SCHEDULE_STORAGE_KEY) !== editor.scheduleVersion) throw new Error('The shared Schedule changed while this editor was open. Reopen the agreement before reviewing it.')
    if (editor.kind === 'meal' && !editor.saved?.notRequired && (mealState !== 'ready' || editor.meal?.name !== meals[editor.type]?.name)) throw new Error('The meal source changed. Reopen coverage for the current meal.')
  }
  const stage = async data => {
    verifyEditor()
    const base = editor.plan
    const proposal = await stageDailyPlanReview({ summary: `Review operating practices for ${base.date}`, operations: [practiceDayOperation(base, data)], expectedVersion: Number(base.version || 0) })
    pending.current = proposal.id
    setNotice('Action Mode review opened. No household record changes until approval.')
    close()
  }
  const agreement = async draft => {
    verifyEditor()
    const card = editor.card
    const operation = card.practice ? scheduleRoutineUpdateOperation(card.practice.routine, draft) : scheduleRoutineCreateOperation(draft)
    const proposal = await requestHouseholdActionReview({ summary: `${card.practice ? 'Revise' : 'Activate'} ${card.template.id} as a real recurring responsibility`, operation })
    pending.current = proposal.id
    setNotice('Review the recurring agreement in Action Mode. Existing responsibilities have not been reassigned.')
    close()
  }
  const checkin = ({ status, note, recovery }) => stage(withPracticeCheckin(editor.plan, editor.card.effectivePractice || editor.card.practice, status, note, recovery))
  const saveMeal = next => { const before = readPracticeDay(editor.plan); if (before.error) throw new Error(before.error); const data = clone(before.data); data.meals[editor.type] = next; return stage(data) }
  const saveReview = notes => { const before = readPracticeDay(editor.plan); if (before.error) throw new Error(before.error); const data = clone(before.data); data.review = { notes, completed: true }; return stage(data) }
  if (compact) {
    const nextCard = cards.find(card => card.state !== 'complete') || cards[0]
    const mealSummaries = PRACTICE_MEALS.map(type => ({ type, readiness: mealReadiness(mealState === 'ready' ? meals[type] : null, saved.data.meals[type]) }))
    const mealsReady = mealSummaries.filter(item => item.readiness.state === 'ready').length
    const sourceReady = planState === 'ready' && schedule.ready && !saved.error && !planError
    return <section className="operating-practices operating-practices--compact" aria-label="Household operating readiness" data-testid="operating-practices">
      <div className="practice-compact-copy"><span className="practice-eyebrow">Household readiness · {plan.date}</span><strong>{sourceReady ? (nextCard?.template.title || 'Review today’s household plan') : 'Readiness is not verified'}</strong><p>{sourceReady ? (nextCard?.label || 'Open Policies & Practices for the next reviewed action.') : (planError || saved.error || schedule.error || 'Waiting for verified Daily Plan and Schedule sources.')}</p></div>
      <div className="practice-compact-status" aria-label="Readiness summary"><span><strong>{cards.filter(card => card.state === 'complete').length}/{cards.length}</strong> practices recorded</span><span><strong>{mealsReady}/{PRACTICE_MEALS.length}</strong> meals ready</span></div>
      <div className="practice-compact-actions"><button type="button" className="practice-primary" aria-label="Policies & Practices" onClick={() => onOpenPractices?.({ date: plan.date, tab: 'daily' })}>Next action</button><button type="button" onClick={() => onNavigate?.('meals')}>Meal plan</button><button type="button" onClick={() => onNavigate?.('calendar')}>Calendar</button></div>
    </section>
  }
  return <section className={`operating-practices${compact ? ' operating-practices--compact' : ''}`} aria-label="Household operating readiness" data-testid="operating-practices">
    <header className="practice-heading"><div><span className="practice-eyebrow">Pray · Prepare · Work · Review</span><h2>{compact ? 'Household Readiness' : 'Policies into Practice'}</h2><p>{plan.date} · {compact ? 'Owners, coverage, and the next action.' : 'The next action, its owner, and the support needed—not another document to sign and forget.'}</p></div>{onOpenPractices && <button type="button" onClick={() => onOpenPractices({ date: plan.date, tab: mode === 'daily' ? 'policies' : mode })}>Policies &amp; Practices</button>}</header>
    {(planState !== 'ready' || !schedule.ready || saved.error || planError) && <div className="practice-source-notice" role="status"><strong>Readiness is not verified.</strong> {planError || saved.error || schedule.error || 'Waiting for the authoritative Daily Plan and Schedule. Missing data will not be presented as success.'}<button type="button" disabled={schedule.loading} onClick={() => { onReload?.(); schedule.reload() }}>Retry sources</button></div>}
    {!canEditPlanning && <p className="practice-muted">View only. Changing shared agreements or practice records requires Plans &amp; decisions permission; no permissions are broadened by this workspace.</p>}
    {notice && <p className="practice-notice" role="status">{notice}</p>}{error && <p className="practice-error" role="alert">{error}</p>}
    {mode !== 'weekly' && <div className="practice-grid">{cards.map(card => { const effective = card.effectivePractice || card.practice; return <article key={card.template.id} className={`practice-card practice-card--${card.state}`}>
      <div className="practice-card-heading"><span>{card.template.id}</span><strong>{schedule.ready ? card.label : 'Source not verified'}</strong></div><h3>{card.template.title}</h3>
      {mode === 'policies' && <p>{card.template.purpose}</p>}{!compact && <p>{card.template.standard}</p>}
      {effective && <p className="practice-owner">{effective.routine.owner} · Backup: {effective.backup}<br />{effective.routine.startTime}–{effective.routine.endTime} · Agreement v{effective.revision}</p>}
      {card.reviewDue && <p className="practice-error">Policy review due {card.practice.reviewDate}. Review what is working; do not merely re-sign.</p>}
      {mode === 'policies' && card.practice && <details><summary>Procedure and review record</summary><p>{card.practice.procedure}</p><p>Effective {card.practice.effectiveDate}. Next review {card.practice.reviewDate}. Actual actor and changes are retained in Action Mode's Audit History.</p></details>}
      {card.checkin?.recovery && <p><strong>Recovery:</strong> {card.checkin.recovery}</p>}
      <div className="practice-actions"><button type="button" onClick={() => onNavigate?.(card.template.id === 'FIN-001' ? 'finance' : card.template.id === 'OPS-001' ? 'schedule' : 'meals')}>{card.template.id === 'FIN-001' ? 'Open financial review' : card.template.id === 'OPS-001' ? 'Review daily Schedule' : 'Review meal planning'}</button>
        {card.practice && card.due && <button type="button" disabled={!canEdit} onClick={() => open('checkin', { card })}>Record result</button>}
        {(mode === 'policies' || !card.practice || card.reviewDue) && <button type="button" disabled={!canEdit || card.matches?.filter(value => value.routine.enabled).length > 1} onClick={() => open('agreement', { card })}>{card.practice ? 'Review agreement' : 'Set up agreement'}</button>}
      </div>
    </article> })}</div>}
    {mode === 'daily' && <>
      <section className="practice-meals"><header><div><h3>Meal coverage and availability</h3>{!compact && <p>Planning, preparation, communication and eating are different records.</p>}</div><button type="button" onClick={() => onNavigate?.('inventory')}>Check supplies &amp; inventory</button></header>
        {mealState !== 'ready' && <p role="status">The rolling meal source is not verified. Coverage below cannot confirm the current menu.</p>}
        <div className="practice-grid">{PRACTICE_MEALS.map(type => { const readiness = mealReadiness(mealState === 'ready' ? meals[type] : null, saved.data.meals[type]); const record = readiness.saved; const currentCoverage = readiness.state !== 'changed' && readiness.state !== 'unknown'; return <article key={type} className={`practice-card practice-card--${readiness.state}`}>
          <span>{labelMeal(type)}</span><h4>{meals[type]?.name || 'Meal not available'}</h4><strong>{readiness.label}</strong>{currentCoverage && record?.readyBy && <p>Ready by {record.readyBy} · {record.owner || 'Owner needed'} · {record.headcount ?? '?'} portions</p>}
          {readiness.state === 'ready' && <p className="practice-availability">Available at: {record.location}</p>}
          {readiness.gaps.length > 0 && <p>{(compact ? readiness.gaps.slice(0, 2) : readiness.gaps).join(' · ')}{compact && readiness.gaps.length > 2 ? ` · ${readiness.gaps.length - 2} more coverage items` : ''}</p>}
          {currentCoverage && record?.portionsEaten != null && <p>{record.portionsEaten} portions reported eaten</p>}{currentCoverage && record?.leftovers && !compact && <p>Leftovers / cleanup: {record.leftovers}</p>}
          <button type="button" disabled={!canEdit || mealState !== 'ready'} onClick={() => open('meal', { type, meal: meals[type], saved: saved.data.meals[type] })}>Review {type} coverage</button>
        </article> })}</div>
      </section>
      {!compact && schedule.ready && <ScheduleCoverage schedule={schedule.data} date={plan.date} currentMember={currentMember} plan={plan} onNavigate={onNavigate} />}
      {!compact && <p className="practice-muted">Before leaving across a mealtime, confirm the meal or an approved funded alternative. This workspace does not authorize purchases, initiate bank transfers, send external notifications, or rate spiritual maturity.</p>}
    </>}
    {mode === 'weekly' && <WeeklyPracticeReview date={plan.date} canEdit={canEdit} revision={reviewRevision} onRecord={() => open('weekly')} />}
    {editor?.kind === 'agreement' && <PracticeAgreementEditor template={editor.card.template} practice={editor.card.practice} date={editor.plan.date} onReview={agreement} onClose={close} />}
    {editor?.kind === 'checkin' && <PracticeCheckinEditor card={{ ...editor.card, practice: editor.card.effectivePractice || editor.card.practice }} onReview={checkin} onClose={close} />}
    {editor?.kind === 'meal' && <PracticeMealEditor type={editor.type} meal={editor.meal} saved={editor.saved} onReview={saveMeal} onClose={close} />}
    {editor?.kind === 'weekly' && <PracticeWeeklyEditor notes={readPracticeDay(editor.plan).data.review.notes} onReview={saveReview} onClose={close} />}
  </section>
}

export function PracticeContextBar({ area, onOpen }) {
  const descriptions = { finance: 'Complete the daily review, check funded allowances before spending, and record exceptions.', schedule: 'Protect work and study, agree on coverage, and prepare tomorrow before the day begins.', meals: 'Check inventory, confirm the cook and ready-by time, and tell the household what is available.' }
  return <aside className="practice-context" aria-label="Connected household practice"><div><strong>Make the policy a practice</strong><p>{descriptions[area] || descriptions.schedule}</p></div><button type="button" onClick={onOpen}>Open Policies &amp; Practices</button></aside>
}

export default function OperatingPracticesWorkspace({ currentMember, canEditPlanning = false, initialDate, initialTab = 'daily', onNavigate }) {
  const [date, setDate] = useState(initialDate || currentDailyPlanDate())
  const [tab, setTab] = useState(initialTab)
  useEffect(() => { if (initialDate) setDate(initialDate); setTab(initialTab) }, [initialDate, initialTab])
  const daily = useDailyPlan(date)
  const rolling = useRollingMealPlan({ startDate: date, requireFresh: true, reloadOnRefreshEvents: true })
  const meals = rolling.data?.days?.find(day => day.date === date)?.resolvedMeals || {}
  return <div className="practice-workspace"><header className="practice-workspace-header"><div><span>Household Management</span><h1>Policies &amp; Practices</h1><p>Daily finance · Household schedule · Meals and procurement</p></div><label><span>Household date</span><input type="date" value={date} onChange={event => { if (event.target.value) setDate(event.target.value) }} /></label></header>
    <nav className="practice-tabs" aria-label="Practice views">{[['daily', 'Daily readiness'], ['policies', 'Agreements & routines'], ['weekly', 'Weekly family review']].map(([id, title]) => <button type="button" key={id} className={tab === id ? 'active' : ''} aria-pressed={tab === id} onClick={() => setTab(id)}>{title}</button>)}<button type="button" onClick={() => setDate(currentDailyPlanDate())}>Today</button><button type="button" onClick={() => setDate(shiftPracticeDate(currentDailyPlanDate(), 1))}>Tomorrow</button></nav>
    <OperatingPracticesPanel key={date} plan={daily.plan} planState={daily.state} planError={daily.error} meals={meals} mealState={rolling.state} currentMember={currentMember} canEditPlanning={canEditPlanning} mode={tab} onNavigate={onNavigate} onReload={daily.reload} />
  </div>
}
