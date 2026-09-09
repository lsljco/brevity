import { useEffect, useMemo, useRef, useState } from 'react'
import './TodayDashboard.css'
import './TodayOperating.css'
import { DECISION_STATUS, DECISION_STATUS_OPTIONS, HOUSEHOLD_MEMBERS, normalizeDailyPlan } from './dailyPlan.js'
import { buildTodayReadModel } from './operatingModel.js'
import DailyCommandSchedule from './DailyCommandSchedule.jsx'

const PILLAR_META = {
  spiritual: ['Spiritual Maturity', 'ti-sun'],
  health: ['Health & Nutrition', 'ti-heart'],
  fitness: ['Physical Fitness', 'ti-run'],
  household: ['Household Management', 'ti-home'],
  education: ['Education / Think Tank', 'ti-book'],
  finance: ['Finance', 'ti-building-bank'],
  ministry: ['Ministry & Fellowship', 'ti-users'],
}

function formatDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

const formatStart = startsAt => startsAt
  ? new Date(startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  : 'All day'

function AttentionPanel({ signals, onOpenCalendar }) {
  if (!signals.length) return <section className="today-attention today-attention--clear"><i className="ti ti-circle-check" aria-hidden="true" /><div><strong>No critical exceptions</strong><span>Brevity has not identified an unresolved operational risk for today.</span></div></section>

  return <section className="today-attention" aria-labelledby="today-attention-title">
    <header><div><span>Act First</span><h2 id="today-attention-title">Needs Attention</h2></div><strong>{signals.length}</strong></header>
    <div className="today-attention-list">{signals.map(signal => <article key={signal.id} className={`today-attention-item today-attention-item--${signal.priority}`}>
      <i className={`ti ${signal.source.system === 'integration' ? 'ti-plug-connected-x' : 'ti-alert-triangle'}`} aria-hidden="true" />
      <div><strong>{signal.title}</strong><span>{signal.detail}</span><small>{PILLAR_META[signal.pillar]?.[0] || 'Household'} · Operational exception</small></div>
      {signal.source.recordType === 'calendar-health' && <button type="button" onClick={onOpenCalendar}>Review Calendar <i className="ti ti-arrow-right" /></button>}
    </article>)}</div>
  </section>
}

function TodayCalendarAgenda({ commitments, nextCommitment, health, onOpenCalendar }) {
  const healthState = health?.state || 'loading'
  const healthLabel = healthState === 'ready' ? 'Verified' : healthState === 'loading' ? 'Checking' : 'Needs attention'
  return <section className="today-section today-calendar-agenda">
    <div className="today-section-heading"><div><span>Next Up</span><h2>{nextCommitment ? nextCommitment.title : 'No commitment scheduled'}</h2></div><button type="button" className="today-calendar-open" onClick={onOpenCalendar}>Open Family Calendar <i className="ti ti-arrow-right" aria-hidden="true" /></button></div>
    <div className={`today-calendar-health today-calendar-health--${healthState}`}><i className={`ti ${healthState === 'ready' ? 'ti-cloud-check' : 'ti-cloud-exclamation'}`} /><span><strong>{healthLabel}</strong> · {health?.message || 'Checking the Apple Family Calendar.'}</span></div>
    {commitments.length ? <div className="today-calendar-list">{commitments.slice(0, 4).map(item => <article className={`today-calendar-item${item.id === nextCommitment?.id ? ' today-calendar-item--next' : ''}`} key={item.id}>
      <time>{formatStart(item.startsAt)}</time>
      <div><strong>{item.title}</strong><span>{item.owner} · {item.source.system === 'apple-calendar' ? 'Apple Family Calendar' : 'Brevity'}</span></div>
      {item.id === nextCommitment?.id ? <em>Next</em> : item.priority === 'high' || item.priority === 'critical' ? <em>Priority</em> : null}
    </article>)}</div> : <div className="today-calendar-empty"><i className={`ti ${health?.usable ? 'ti-calendar-check' : 'ti-calendar-off'}`} aria-hidden="true" /><div><strong>{health?.usable ? 'No commitments are visible for today' : 'Today’s calendar is not verified'}</strong><span>{health?.usable ? 'Open Family Calendar if you expected an appointment.' : 'Restore or refresh the calendar connection before relying on this schedule.'}</span></div></div>}
  </section>
}

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }

function TodayMeals({ meals, state = 'loading', error = '', onOpenMealPlan }) {
  const entries = Object.entries(MEAL_LABELS).map(([mealType, label]) => ({ mealType, label, meal: meals?.[mealType] })).filter(item => item.meal)
  if (!entries.length) {
    const loading=state==='loading'
    const title=loading?'Loading today’s meals':error?'Today’s meal plan is unavailable':'No meals are planned for today'
    const detail=loading?'Brevity is checking the authoritative rolling meal plan.':error?'Open Meal Plan to retry or review the connection.':'Open Meal Plan to review the rolling plan; Brevity will not invent missing meals.'
    return <section className="today-section today-meals today-meals--empty" aria-labelledby="today-meals-title" aria-live="polite">
      <div className="today-section-heading"><div><span>At the Table</span><h2 id="today-meals-title">Today’s Meals</h2></div><button type="button" className="today-meals-open" onClick={onOpenMealPlan}>Open Meal Plan <i className="ti ti-arrow-right" aria-hidden="true" /></button></div>
      <div className="today-meals-empty"><i className={`ti ${loading?'ti-loader-2':'ti-tools-kitchen-2'}`} aria-hidden="true"/><div><strong>{title}</strong><span>{detail}</span></div></div>
    </section>
  }
  return <section className="today-section today-meals" aria-labelledby="today-meals-title">
    <div className="today-section-heading"><div><span>At the Table</span><h2 id="today-meals-title">Today’s Meals</h2></div><button type="button" className="today-meals-open" onClick={onOpenMealPlan}>Open Meal Plan <i className="ti ti-arrow-right" aria-hidden="true" /></button></div>
    <div className="today-meal-grid">{entries.map(({ mealType, label, meal }) => <article className="today-meal-card" key={mealType}>
      <img src={meal.image} alt={`${label}: ${meal.name}`} loading={mealType === 'breakfast' ? 'eager' : 'lazy'} />
      <div className="today-meal-card-copy"><span>{label}</span><strong>{meal.name}</strong><small>{meal.prepMinutes} min · {meal.macros?.proteinGrams || 0}g protein</small></div>
    </article>)}</div>
  </section>
}

function DecisionEditor({ decision, number, expectedVersion, onSave, readOnly = false }) {
  const openedVersionRef = useRef(expectedVersion)
  const [draft, setDraft] = useState(() => ({ title: decision.title, notes: decision.detail, owner: decision.owner || 'Family', status: decision.state || DECISION_STATUS.needsDecision }))
  const [saveState, setSaveState] = useState('idle')
  const [error, setError] = useState('')
  const update = (field, value) => {
    if (readOnly) return
    setDraft(current => ({ ...current, [field]: value }))
  }
  const save = async () => {
    if (readOnly) return
    setSaveState('saving')
    setError('')
    try {
      await onSave(draft, openedVersionRef.current)
      setSaveState('reviewing')
    } catch (saveError) {
      setSaveState('error')
      setError(saveError.message || 'Could not save this decision.')
    }
  }

  return <article className="today-decision-editor"><div className="today-decision-editor-heading"><span>{String(number).padStart(2, '0')}</span><label><span>Decision</span><input readOnly={readOnly} value={draft.title || ''} onChange={event => update('title', event.target.value)} /></label></div><label><span>Update / resolution</span><textarea readOnly={readOnly} value={draft.notes || ''} onChange={event => update('notes', event.target.value)} placeholder="Enter the decision, answer, or update needed…" /></label><div className="today-decision-editor-fields"><label><span>Owner</span><select disabled={readOnly} value={draft.owner} onChange={event => update('owner', event.target.value)}><option>Family</option>{HOUSEHOLD_MEMBERS.map(member => <option key={member}>{member}</option>)}</select></label><label><span>Status</span><select disabled={readOnly} value={draft.status} onChange={event => update('status', event.target.value)}>{DECISION_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>{error && <p className="today-decision-save-error">{error}</p>}<footer><small>{readOnly ? 'View only · Plans & decisions permission is required to update this record.' : saveState === 'reviewing' ? 'Review this proposal in Action Mode.' : 'Nothing changes until you approve it in Action Mode.'}</small>{!readOnly && <button type="button" onClick={save} disabled={saveState === 'saving' || !draft.title?.trim()}><i className="ti ti-shield-check" /> {saveState === 'saving' ? 'Opening review…' : 'Review update'}</button>}</footer></article>
}

const ASSIGNMENT_STATUS_OPTIONS = [
  ['pending', 'Pending'], ['needs-decision', 'Needs decision'], ['ready', 'Ready'], ['in-progress', 'In progress'], ['complete', 'Complete'], ['deferred', 'Deferred'],
]

function AssignmentEditor({ assignment, expectedVersion, readOnly, onSave }) {
  const [draft, setDraft] = useState(() => ({ title:assignment.title, notes:assignment.detail, status:assignment.state }))
  const [openedVersion, setOpenedVersion] = useState(null)
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')
  const update = (field, value) => {
    if (readOnly) return
    setOpenedVersion(current => current ?? expectedVersion)
    setDraft(current => ({ ...current, [field]:value }))
    setState('idle')
  }
  const review = async () => {
    setState('saving'); setError('')
    try {
      await onSave(draft, openedVersion ?? expectedVersion)
      setState('reviewing')
    } catch (reviewError) {
      setState('error'); setError(reviewError.message || 'Could not open this assignment review.')
    }
  }
  return <article className="today-assignment today-assignment--editable"><div className="today-assignment-edit-fields"><label><span>Assignment</span><input value={draft.title || ''} readOnly={readOnly} onChange={event => update('title', event.target.value)} /></label><label><span>Actionable detail</span><textarea value={draft.notes || ''} readOnly={readOnly} onChange={event => update('notes', event.target.value)} /></label></div><label className="today-assignment-status"><span>Status</span><select value={draft.status || 'pending'} disabled={readOnly} onChange={event => update('status', event.target.value)}>{ASSIGNMENT_STATUS_OPTIONS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>{!readOnly && <button type="button" onClick={review} disabled={state === 'saving' || !draft.title?.trim()}><i className="ti ti-shield-check" /> {state === 'saving' ? 'Opening…' : 'Review'}</button>}{error && <small className="today-decision-save-error">{error}</small>}{state === 'reviewing' && <small>Review this proposal in Action Mode.</small>}</article>
}

function PillarPulse({ items, onOpenPillar }) {
  return <section className="today-section today-pulse"><div className="today-section-heading"><div><span>Seven Pillars</span><h2>Household Pulse</h2></div><small>Exceptions and readiness—not seven separate reports.</small></div><div className="today-pillar-grid">{items.map(item => {
    const [label, icon] = PILLAR_META[item.pillar]
    return <button key={item.pillar} className="today-pillar-button" onClick={() => onOpenPillar?.(item.pillar)}><article className={`today-pillar-card today-pillar-card--${item.state}`}><div className="today-pillar-icon"><i className={`ti ${icon}`} /></div><div><span className="today-pillar-label">{label}</span><strong>{item.summary}</strong></div>{item.state === 'attention' ? <em>{item.attentionCount}</em> : <i className="ti ti-check" aria-label="Ready" />}</article></button>
  })}</div></section>
}

export default function TodayDashboard({ plan, meals = {}, mealPlanState = 'loading', mealPlanError = '', readOnly = false, canGeneratePlan = false, todayAlignmentCompleted = false, todayAlignmentUnavailable = false, alignmentDate, alignmentCompleted = false, alignmentLoading = false, calendarAppointments = [], calendarHealth, currentMember = 'Larry', onStartTodayAlignment, onStartAlignment, onStartRecap, onOpenPillar, onOpenCalendar, onOpenMealPlan, onGeneratePlan, onReviewDecision, onReviewAssignment, generationState = 'idle' }) {
  const dailyPlan = useMemo(() => normalizeDailyPlan(plan), [plan])
  const readModel = useMemo(() => buildTodayReadModel({ plan: dailyPlan, calendarAppointments, calendarHealth, currentMember }), [calendarAppointments, calendarHealth, currentMember, dailyPlan])
  const [showDecisions, setShowDecisions] = useState(false)
  const closed = Boolean(dailyPlan.recap?.completedAt)
  const generated = dailyPlan.generatedBy === 'brevity-daily-household-plan'

  const saveDecision = async (updatedDecision, decisionId, expectedVersion) => {
    if (readOnly) throw new Error('Plans & decisions permission is required to update the shared decision queue.')
    await onReviewDecision?.(decisionId, updatedDecision, expectedVersion)
  }

  useEffect(() => {
    if (!showDecisions) return undefined
    const closeOnEscape = event => { if (event.key === 'Escape') setShowDecisions(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [showDecisions])

  return <div className="today-dashboard">
    <header className="today-hero">
      <div><p className="today-kicker">Household Command Center</p><h1>Today</h1><p>{formatDate(dailyPlan.date)}</p></div>
      <div className="today-hero-actions">
        <button className="today-alignment-button" onClick={onGeneratePlan} disabled={readOnly || !canGeneratePlan || generationState === 'generating'} title={!canGeneratePlan ? 'Generated whole-plan drafts require household-administrator review.' : readOnly ? 'Plans & decisions permission is required to generate the daily plan.' : undefined}><i className="ti ti-sparkles" /> {generationState === 'generating' ? 'Generating…' : generationState === 'draft-ready' ? 'Review Scheduled Draft' : generationState === 'reviewing' ? 'Review Draft Again' : generated ? 'Generate Updated Draft' : 'Generate Daily Plan Draft'}</button>
        <button className="today-alignment-button" onClick={onStartTodayAlignment} disabled={todayAlignmentUnavailable} title={`Alignment for ${formatDate(dailyPlan.date)}`}><i className="ti ti-adjustments-horizontal" /> {readOnly ? 'View Today’s Alignment' : todayAlignmentCompleted ? 'Adjust Today’s Alignment' : 'Start Today’s Alignment'}</button>
        <button className="today-alignment-button" onClick={onStartAlignment} disabled={alignmentLoading} title={alignmentDate ? `Alignment for ${formatDate(alignmentDate)}` : undefined}><i className="ti ti-target-arrow" /> {alignmentLoading ? 'Loading Tomorrow…' : readOnly ? 'View Tomorrow’s Alignment' : alignmentCompleted ? 'Review Tomorrow’s Alignment' : 'Start Tomorrow’s Alignment'}</button>
        <button className="today-alignment-button today-alignment-button--secondary" onClick={onStartRecap}><i className="ti ti-clipboard-check" /> {readOnly ? 'View Recap' : closed ? 'Review Recap' : 'Close Today'}</button>
      </div>
    </header>

    <AttentionPanel signals={readModel.signals} onOpenCalendar={onOpenCalendar} />

    <section className="today-focus-card"><div><span>Today's Focus</span><h2>{readModel.focus.headline}</h2>{readModel.focus.detail && <p>{readModel.focus.detail}</p>}{readModel.governingPrinciple && <p>{readModel.governingPrinciple}</p>}</div><button type="button" className="today-decision-count" onClick={() => setShowDecisions(true)} disabled={!readModel.counts.decisions} aria-haspopup="dialog" aria-expanded={showDecisions}><strong>{readModel.counts.decisions}</strong><span>{readModel.counts.decisions ? readModel.counts.decisions === 1 ? 'decision needs attention' : 'decisions need attention' : 'no decisions need attention'}</span><i className={`ti ${readModel.counts.decisions ? 'ti-chevron-right' : 'ti-circle-check'}`} aria-hidden="true" /></button></section>

    {showDecisions && <div className="today-decision-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowDecisions(false) }}><section className="today-decision-dialog" role="dialog" aria-modal="true" aria-labelledby="today-decision-dialog-title"><header><div><span>Decision Queue</span><h2 id="today-decision-dialog-title">Decisions needing attention</h2><p>{readModel.counts.decisions} active {readModel.counts.decisions === 1 ? 'decision' : 'decisions'} for {formatDate(dailyPlan.date)}. A determined decision remains visible until its resulting work is complete.</p></div><button type="button" onClick={() => setShowDecisions(false)} aria-label="Close decision list"><i className="ti ti-x" /></button></header><div className="today-decision-dialog-list">{readModel.decisions.map((decision, index) => <DecisionEditor key={decision.id} decision={decision} number={index + 1} expectedVersion={Number(dailyPlan.version || 0)} readOnly={readOnly} onSave={(updated, version) => saveDecision(updated, decision.id, version)} />)}{!readModel.decisions.length && <div className="today-decision-all-clear"><i className="ti ti-circle-check" /><strong>All decisions are resolved.</strong><span>There are no remaining decisions needing attention.</span></div>}</div></section></div>}

    <TodayCalendarAgenda commitments={readModel.commitments} nextCommitment={readModel.nextCommitment} health={calendarHealth} onOpenCalendar={onOpenCalendar} />

    <TodayMeals meals={meals} state={mealPlanState} error={mealPlanError} onOpenMealPlan={onOpenMealPlan} />

    <section className="today-section today-outcomes"><div className="today-section-heading"><div><span>Daily Outcomes</span><h2>Today’s Top 3</h2></div><small>Outcomes that make today successful—not a general task list.</small></div><ol className="today-top-three">{[0,1,2].map(index => <li key={index} className={readModel.outcomes[index] ? '' : 'today-top-three--empty'}>{readModel.outcomes[index]?.title || 'Outcome not set'}{readModel.outcomes[index]?.owner && <span>{readModel.outcomes[index].owner}</span>}</li>)}</ol></section>

    <section className="today-section today-actions"><div className="today-section-heading"><div><span>Personal View</span><h2>{currentMember}'s Actions</h2></div><small>Assignment edits open Action Mode review before changing the shared plan.</small></div>{readModel.actions.length ? <div className="today-assignment-list">{readModel.actions.map(item => <AssignmentEditor key={item.id} assignment={item} expectedVersion={Number(dailyPlan.version || 0)} readOnly={readOnly} onSave={(updated, version) => onReviewAssignment?.(item.id, updated, version)} />)}</div> : <div className="today-empty">{readModel.memberOutcomes.length ? `${currentMember} owns ${readModel.memberOutcomes.length} outcome${readModel.memberOutcomes.length===1?'':'s'} in Today’s Top 3, with no separate unresolved assignment.` : `No unresolved assignments or Top 3 outcomes currently involve ${currentMember}.`}</div>}</section>

    <PillarPulse items={readModel.pillarPulse} onOpenPillar={onOpenPillar} />

    <DailyCommandSchedule plan={dailyPlan} showDecisions={false} />
  </div>
}
