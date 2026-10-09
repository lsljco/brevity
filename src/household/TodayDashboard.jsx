import OrchestrationPanel from '../governance/OrchestrationPanel.jsx'
import TodayOverview from './TodayOverview.jsx'
import DailyRhythm from './DailyRhythm.jsx'
import ReadAloud from '../assistant/ReadAloud.jsx'
import HealthCare from '../health/HealthCare.jsx'
import TodayMaintenance from './TodayMaintenance.jsx'
import TodayMealsPanel from '../meals/TodayMealsPanel.jsx'
import CalendarScopeFilter from '../family/CalendarScopeFilter.jsx'
import { matchesCalendarScopes } from '../family/calendarScopes.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import './TodayDashboard.css'
import ExerciseImageViewer from '../fitness/ExerciseImageViewer.jsx'
import './TodayOperating.css'
import './TodayPillarOrder.css'
import { DECISION_STATUS, DECISION_STATUS_OPTIONS, HOUSEHOLD_MEMBERS, normalizeDailyPlan } from './dailyPlan.js'
import { buildTodayReadModel } from './operatingModel.js'
import { sermonDevotionForDate, sermonDevotionImageUrl } from './sermonDevotion.js'
import { educationBrief, ministryBrief } from './todayPillarBriefs.js'
import TodayFinanceBrief from './TodayFinanceBrief.jsx'
import WeatherHeader from './WeatherHeader.jsx'
import { workoutForDate } from '../fitness/fitnessWorkoutPlan.js'

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

function AttentionPanel({ items, onOpenCalendar, onOpenPillar }) {
  if (!items.length) return <section className="today-attention today-attention--clear"><i className="ti ti-circle-check" aria-hidden="true" /><div><strong>No household items need attention</strong><span>Brevity has not identified an unresolved household priority or operational exception for today.</span></div></section>

  return <section className="today-attention" aria-labelledby="today-attention-title">
    <header><div><span>Act First</span><h2 id="today-attention-title">Needs Attention</h2></div><strong>{items.length}</strong></header>
    <div className="today-attention-list">{items.map(item => <article key={item.id} className={`today-attention-item today-attention-item--${item.priority}`}>
      <i className={`ti ${item.source.system === 'integration' ? 'ti-plug-connected-x' : item.source.recordType === 'household-priority' ? 'ti-home-exclamation' : 'ti-alert-triangle'}`} aria-hidden="true" />
      <div><strong>{item.title}</strong>{item.detail && <span>{item.detail}</span>}<small>{item.source.recordType === 'household-priority' ? 'Household Management · Unresolved priority' : `${PILLAR_META[item.pillar]?.[0] || 'Household'} · Operational exception`}</small></div>
      {item.source.system === 'household-operations' && <button type="button" onClick={() => onOpenPillar?.('household')}>Review Household Operations <i className="ti ti-arrow-right" /></button>}
      {item.source.recordType === 'calendar-health' && <button type="button" onClick={onOpenCalendar}>Review Calendar <i className="ti ti-arrow-right" /></button>}
    </article>)}</div>
  </section>
}

function TodayCalendarAgenda({ filters, commitments, nextCommitment, health, onOpenCalendar, browsingDate }) {
  const healthState = health?.state || 'loading'
  const healthLabel = healthState === 'ready' ? 'Verified' : healthState === 'loading' ? 'Checking' : 'Needs attention'
  return <section className="today-section today-calendar-agenda" aria-labelledby="today-calendar-title">
    <div className="today-section-heading"><div><span>Calendar · {commitments.length} {commitments.length === 1 ? 'item' : 'items'}</span><h2 id="today-calendar-title">{browsingDate ? 'Appointments & Meetings' : 'Today’s Appointments & Meetings'}</h2></div><button type="button" className="today-calendar-open" onClick={onOpenCalendar}>Open Family Calendar <i className="ti ti-arrow-right" aria-hidden="true" /></button></div>
    {filters}
    <div className={`today-calendar-health today-calendar-health--${healthState}`}><i className={`ti ${healthState === 'ready' ? 'ti-cloud-check' : 'ti-cloud-exclamation'}`} /><span><strong>{healthLabel}</strong> · {health?.message || 'Checking the Apple Family Calendar.'}</span></div>
    {commitments.length ? <div className="today-calendar-list">{commitments.map(item => <article className={`today-calendar-item${!browsingDate && item.id === nextCommitment?.id ? ' today-calendar-item--next' : ''}`} key={item.id}>
      <time>{formatStart(item.startsAt)}</time>
      <div><strong>{item.title}</strong><span>{item.owner} · {item.source.system === 'apple-calendar' ? (item.source.calendarName || 'Apple Family Calendar') : 'Brevity'}</span></div>
      {!browsingDate && item.id === nextCommitment?.id ? <em>Next</em> : item.priority === 'high' || item.priority === 'critical' ? <em>Priority</em> : null}
    </article>)}</div> : <div className="today-calendar-empty"><i className={`ti ${health?.usable ? 'ti-calendar-check' : 'ti-calendar-off'}`} aria-hidden="true" /><div><strong>{health?.usable ? `No commitments are visible for ${browsingDate ? 'this day' : 'today'}` : 'The calendar is not verified'}</strong><span>{health?.usable ? 'Open Family Calendar if you expected an appointment.' : 'Restore or refresh the calendar connection before relying on this schedule.'}</span></div></div>}
  </section>
}

function TodayHouseholdChores({ chores = [], onOpenPillar, browsingDate }) {
  const complete = status => status === 'Approved' || status === 'Complete'
  return <section className="today-section today-household-chores" aria-labelledby="today-chores-title">
    <div className="today-section-heading"><div><span>Household Operations · {chores.length} due</span><h2 id="today-chores-title">{browsingDate ? 'Scheduled Chores' : 'Today’s Chores'}</h2></div>{onOpenPillar && <button type="button" className="today-calendar-open" onClick={() => onOpenPillar('household')}>Open Household Operations <i className="ti ti-arrow-right" aria-hidden="true" /></button>}</div>
    {chores.length ? <div className="today-chore-list">{chores.map(chore => <article className={`today-chore-item${complete(chore.status) ? ' today-chore-item--complete' : ''}`} key={chore.occurrenceId}>
      <i className={`ti ${complete(chore.status) ? 'ti-circle-check' : chore.status === 'Exception' || chore.status === 'Returned' ? 'ti-alert-triangle' : chore.status === 'In progress' ? 'ti-progress' : 'ti-circle'}`} aria-hidden="true" />
      <div><strong>{chore.title}</strong><span>{chore.timing || 'Flexible'} · {chore.zone || 'Whole House'}</span><small>{chore.owners?.join(', ') || 'Family'}</small></div>
      <em>{chore.status}</em>
    </article>)}</div> : <div className="today-calendar-empty"><i className="ti ti-circle-check" aria-hidden="true" /><div><strong>No Household Operations chores are scheduled {browsingDate ? 'for this day' : 'today'}</strong><span>Open Household Operations to review the weekly plan or add a dated chore through Action Mode.</span></div></div>}
  </section>
}

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }

function TodayMeals({ meals, state = 'loading', error = '', onOpenMealPlan, browsingDate, currentMember, mealDay, mealLibrary, readOnly }) {
  const entries = Object.entries(MEAL_LABELS).map(([mealType, label]) => ({ mealType, label, meal: meals?.[mealType] })).filter(item => item.meal)
  if (!entries.length) {
    const loading=state==='loading'
    const dayLabel=browsingDate?'this day':'today'
    const title=browsingDate?(loading?`Loading meals for ${dayLabel}`:error?`The meal plan for ${dayLabel} is unavailable`:`No meals are planned for ${dayLabel}`):(loading?'Loading today’s meals':error?'Today’s meal plan is unavailable':'No meals are planned for today')
    const detail=loading?'Brevity is checking the authoritative rolling meal plan.':error?'Open Meal Plan to retry or review the connection.':'Open Meal Plan to review the rolling plan; Brevity will not invent missing meals.'
    return <section className="today-section today-meals today-meals--empty" aria-labelledby="today-meals-title" aria-live="polite" data-pillar="health">
      <div className="today-section-heading"><div><span>Pillar 2 · Health &amp; Nutrition</span><h2 id="today-meals-title">{browsingDate ? 'Planned Meals' : 'Today’s Meals'}</h2></div><button type="button" className="today-meals-open" onClick={onOpenMealPlan}>Open Meal Plan <i className="ti ti-arrow-right" aria-hidden="true" /></button></div>
      <div className="today-meals-empty"><i className={`ti ${loading?'ti-loader-2':'ti-tools-kitchen-2'}`} aria-hidden="true"/><div><strong>{title}</strong><span>{detail}</span></div></div>
    </section>
  }
  return <TodayMealsPanel readOnly={readOnly} meals={meals} currentMember={currentMember} mealDay={mealDay} library={mealLibrary} onOpenMealPlan={onOpenMealPlan} browsingDate={browsingDate} />
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

function TodayDevotionHero({ plan, onOpenPillar, browsingDate = false }) {
  const notes=plan.spiritual?.sermonNotes||{}
  const source=plan.spiritual?.sermonSource||{}
  const devotion=sermonDevotionForDate({notes,source,targetDate:plan.date})
  const imageUrl=sermonDevotionImageUrl({notes,source,targetDate:plan.date})
  const [imageFailed,setImageFailed]=useState(false)
  useEffect(()=>setImageFailed(false),[imageUrl])
  const title=devotion?.title||plan.spiritual?.todayFocus||'Today’s Spiritual Formation'
  const focus=devotion?.devotionFocus||plan.spiritual?.devotionFocus||'Open Spiritual Maturity to review today’s formation.'
  const scripture=devotion?.scripture||plan.spiritual?.scripture?.[0]||''
  return <section className={`today-devotion-hero${imageUrl&&!imageFailed?' has-image':''}`} data-pillar="spiritual">
    {imageUrl&&!imageFailed&&<img src={imageUrl} alt={`Today’s devotion: ${title}`} onError={()=>setImageFailed(true)} />}
    <div className="today-devotion-shade" />
    <div className="today-devotion-copy"><span>Pillar 1 · Spiritual Maturity{devotion?` · Day ${devotion.dayNumber} of 7`:''}</span><h2>{title}</h2>{scripture&&<strong>{scripture}</strong>}<p>{focus}</p><ReadAloud getText={()=>[title,scripture,focus].filter(Boolean).join("\n\n")} label={browsingDate ? "Read this day’s devotion aloud" : "Read today’s devotion aloud"} contentKey={plan.date+title}/>{onOpenPillar && <button type="button" onClick={()=>onOpenPillar('spiritual')}>Open Today’s Devotion <i className="ti ti-arrow-right" /></button>}</div>
    {!imageUrl||imageFailed?<small className="today-devotion-visual-status">Devotion visual becomes available after the sermon package is generated.</small>:null}
  </section>
}

function PillarBrief({ number, pillar, title, detail, meta = [], prayerNeeds = [], onOpenPillar }) {
  const [label,icon]=PILLAR_META[pillar]
  return <section className="today-section today-pillar-brief" data-pillar={pillar}>
    <div className="today-pillar-brief-icon"><i className={`ti ${icon}`} /></div>
    <div className="today-pillar-brief-copy"><span>Pillar {number} · {label}</span><h2>{title||label}</h2>{detail&&<p>{detail}</p>}{meta.filter(Boolean).length>0&&<div>{meta.filter(Boolean).map((item,index)=><em key={`${pillar}-${index}`}>{item}</em>)}</div>}{prayerNeeds.length>0&&<details className="today-prayer-needs"><summary>View all {prayerNeeds.length} prayer needs</summary><ol>{prayerNeeds.map((prayer,index)=><li key={`${index}-${prayer}`}>{prayer}</li>)}</ol></details>}</div>
    {onOpenPillar && <button type="button" onClick={()=>onOpenPillar(pillar)} aria-label={`Open ${label}`}>Open <i className="ti ti-arrow-right" /></button>}
  </section>
}

function TodayFitnessWorkout({ date, currentMember, fitness, onOpenPillar }) {
  const workout = useMemo(() => workoutForDate(date, currentMember, fitness), [date, currentMember, fitness])
  return <section className="today-section today-fitness-workout" data-pillar="fitness" aria-labelledby="today-fitness-title">
    <div className="today-section-heading today-fitness-heading">
      <div><span>Pillar 3 · Physical Fitness</span><h2 id="today-fitness-title">{workout.title}</h2><p>{workout.focus}</p></div>
      {onOpenPillar && <button type="button" className="today-fitness-open" onClick={() => onOpenPillar('fitness')}>Open Full Workout <i className="ti ti-arrow-right" aria-hidden="true" /></button>}
    </div>
    <div className="today-fitness-summary" aria-label="Today’s workout summary">
      <span><i className="ti ti-clock" aria-hidden="true" /> {workout.duration}</span>
      <span><i className="ti ti-map-pin" aria-hidden="true" /> {fitness?.location || 'Workout location not set'}</span>
      <span><i className="ti ti-walk" aria-hidden="true" /> Abs + {workout.stepGoal.toLocaleString()} steps</span>
    </div>
    <div className="today-fitness-exercises">
      {workout.exercises.map((exercise, index) => <article className="today-fitness-exercise" key={exercise.id}>
        <ExerciseImageViewer exercise={exercise} className="today-fitness-exercise-image" loading={index < 2 ? 'eager' : 'lazy'}>
          <span className="today-fitness-exercise-number">{String(index + 1).padStart(2, '0')}</span>
        </ExerciseImageViewer>
        <div className="today-fitness-exercise-copy">
          <small>{exercise.muscles.join(' · ')}</small>
          <strong>{exercise.name}</strong>
          <span>{exercise.sets} sets · {exercise.reps} · {exercise.rest} rest</span>
        </div>
      </article>)}
    </div>
  </section>
}

// Alignment presents the same cards as Today, using the reviewed day's draft.
export function AlignmentPillarPreview({ pillar, plan, currentMember, meals, mealDay, mealLibrary, mealPlanState, mealPlanError, calendarAppointments = [], calendarHealth, householdChores = [], canViewFinance, onOpenMealPlan, onOpenCalendar }) {
  const [selectedCalendars, setSelectedCalendars] = useState(['All'])
  const visible = calendarAppointments.filter(item => matchesCalendarScopes(item, selectedCalendars))
  const model = buildTodayReadModel({ plan, calendarAppointments:visible, calendarHealth, currentMember })
  const education = educationBrief(plan.education || {})
  const ministry = ministryBrief(plan.ministry || {})
  return <div className="alignment-day-preview today-dashboard" aria-label={`${formatDate(plan.date)} ${PILLAR_META[pillar]?.[0] || pillar} preview`}>
    {pillar === 'spiritual' && <TodayDevotionHero plan={plan} browsingDate />}
    {pillar === 'health' && <>
      <HealthCare currentMember={currentMember} isAdmin={canViewFinance} date={plan.date} appointments={calendarAppointments} onOpenCalendar={onOpenCalendar} readOnly compact />
      <TodayMeals meals={meals} mealDay={mealDay} mealLibrary={mealLibrary} state={mealPlanState} error={mealPlanError} currentMember={currentMember} onOpenMealPlan={onOpenMealPlan} browsingDate readOnly />
    </>}
    {pillar === 'fitness' && <TodayFitnessWorkout date={plan.date} currentMember={currentMember} fitness={plan.fitness} />}
    {pillar === 'household' && <>
      <DailyRhythm plan={plan} currentMember={currentMember} chores={householdChores} />
      <section className="today-focus-card"><div><span>Daily Focus</span><h2>{plan.household?.keyFocus || 'No focus has been set for this day.'}</h2></div></section>
      <TodayHouseholdChores chores={householdChores} browsingDate />
      <TodayCalendarAgenda filters={<CalendarScopeFilter selected={selectedCalendars} onChange={setSelectedCalendars}/>} commitments={model.commitments} health={calendarHealth} onOpenCalendar={onOpenCalendar} browsingDate />
      <section className="today-section today-outcomes"><div className="today-section-heading"><h2>Top 3 Outcomes</h2></div><ol className="today-top-three">{[0,1,2].map(index=><li key={index}>{model.outcomes[index]?.title || 'Outcome not set'}</li>)}</ol></section>
    </>}
    {pillar === 'education' && <PillarBrief number={5} pillar="education" {...education} />}
    {pillar === 'finance' && <TodayFinanceBrief date={plan.date} finance={plan.finance} canViewFinance={canViewFinance} />}
    {pillar === 'ministry' && <PillarBrief number={7} pillar="ministry" {...ministry} />}
  </div>
}

export default function TodayDashboard({ plan, meals = {}, mealDay = null, mealLibrary = [], mealPlanState = 'loading', mealPlanError = '', readOnly = false, canViewFinance = false, canGeneratePlan = false, todayAlignmentCompleted = false, todayAlignmentUnavailable = false, alignmentDate, alignmentCompleted = false, alignmentLoading = false, calendarAppointments = [], calendarHealth, householdChores = [], householdSignals = [], currentMember = 'Larry', onStartTodayAlignment, onStartAlignment, onStartRecap, onChartCourse, onViewSchedule, onOpenPillar, onOpenCalendar, onOpenMealPlan, onGeneratePlan, onReviewDecision, onReviewAssignment, onReviewDailyFocus, generationState = 'idle', browsingDate = false }) {
  const dailyPlan = useMemo(() => normalizeDailyPlan(plan), [plan])
  const [calendarSelection,setCalendarSelection] = useState({member:currentMember,selected:[currentMember]})
  const selectedCalendars = calendarSelection.member === currentMember ? calendarSelection.selected : [currentMember]
  const visibleAppointments = calendarAppointments.filter(item => matchesCalendarScopes(item,selectedCalendars))
  const readModel = buildTodayReadModel({plan:dailyPlan,calendarAppointments:visibleAppointments,calendarHealth,currentMember,householdSignals})
  const [showDecisions, setShowDecisions] = useState(false)
  const [editingFocus, setEditingFocus] = useState(false)
  const [focusDraft, setFocusDraft] = useState(dailyPlan.household?.keyFocus || '')
  const [focusState, setFocusState] = useState('idle')
  const [focusError, setFocusError] = useState('')
  const closed = Boolean(dailyPlan.recap?.completedAt)
  const generated = dailyPlan.generatedBy === 'brevity-daily-household-plan'

  const saveDecision = async (updatedDecision, decisionId, expectedVersion) => {
    if (readOnly) throw new Error('Plans & decisions permission is required to update the shared decision queue.')
    await onReviewDecision?.(decisionId, updatedDecision, expectedVersion)
  }

  const reviewFocus = async () => {
    setFocusState('saving'); setFocusError('')
    try {
      await onReviewDailyFocus?.(focusDraft, Number(dailyPlan.version || 0))
      setFocusState('reviewing')
    } catch (reviewError) {
      setFocusState('error'); setFocusError(reviewError.message || 'Could not open Today’s Focus review.')
    }
  }

  useEffect(() => {
    if (!showDecisions) return undefined
    const closeOnEscape = event => { if (event.key === 'Escape') setShowDecisions(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [showDecisions])

  const fitness=dailyPlan.fitness||{},education=dailyPlan.education||{},finance=dailyPlan.finance||{},ministry=dailyPlan.ministry||{}
  const educationCard=educationBrief(education)
  const ministryCard=ministryBrief(ministry)

  return <div className="today-dashboard">
    {browsingDate?<header className="today-hero"><h1>{formatDate(dailyPlan.date)}</h1></header>:<TodayOverview plan={dailyPlan} currentMember={currentMember} householdChores={householdChores} calendarAppointments={calendarAppointments} calendarHealth={calendarHealth} onStartRecap={onStartRecap} onChartCourse={onChartCourse} onOpenCalendar={onOpenCalendar} onViewSchedule={onViewSchedule} readOnly={readOnly} onEditFocus={()=>{setFocusDraft(dailyPlan.household?.keyFocus||'');setEditingFocus(true)}} />}
    <details className="today-supporting" open={browsingDate||undefined}><summary>Weather</summary><WeatherHeader date={dailyPlan.date}/></details>
    <TodayDevotionHero plan={dailyPlan} onOpenPillar={onOpenPillar} />

    <HealthCare currentMember={currentMember} isAdmin={canViewFinance} date={dailyPlan.date} appointments={visibleAppointments} onOpenCalendar={onOpenCalendar} readOnly={readOnly} compact />

    <TodayMeals readOnly={readOnly} currentMember={currentMember} mealDay={mealDay} mealLibrary={mealLibrary} meals={meals} state={mealPlanState} error={mealPlanError} onOpenMealPlan={onOpenMealPlan} browsingDate={browsingDate} />

    <TodayFitnessWorkout date={dailyPlan.date} currentMember={currentMember} fitness={fitness} onOpenPillar={onOpenPillar} />

    <details className="today-supporting" open={browsingDate||undefined}><summary>Household details & responsibility updates</summary><button onClick={onGeneratePlan} disabled={readOnly || !canGeneratePlan || generationState === 'generating'}>Review Scheduled Draft</button><button onClick={()=>setShowDecisions(true)}>Review decisions</button><section className="today-pillar-stack" data-pillar="household">
      {!browsingDate&&<><button onClick={onStartTodayAlignment}>Edit today’s plan</button><button onClick={onStartAlignment}>Edit tomorrow’s plan</button><button disabled={readOnly} onClick={()=>{setFocusDraft(dailyPlan.household?.keyFocus||'');setEditingFocus(true)}}>Set Today’s Focus</button></>}<details><summary>Assistant settings & administration</summary><OrchestrationPanel date={dailyPlan.date} currentMember={currentMember} readOnly={readOnly} onOpenSource={()=>onOpenPillar?.('household')} /></details><div className="today-pillar-stack-heading"><span>Pillar 4 · Household Management</span><h2>Household Management &amp; Maintenance</h2></div>
      <AttentionPanel onOpenPillar={onOpenPillar} items={readModel.attentionItems} onOpenCalendar={onOpenCalendar} />
      <DailyRhythm readOnly={readOnly} plan={dailyPlan} currentMember={currentMember} chores={householdChores} onOpenOperations={()=>onOpenPillar?.('household')} />
      <TodayHouseholdChores chores={householdChores} onOpenPillar={onOpenPillar} browsingDate={browsingDate} />

      <TodayMaintenance date={dailyPlan.date} onOpenPillar={onOpenPillar} />
      <TodayCalendarAgenda filters={<CalendarScopeFilter selected={selectedCalendars} onChange={selected=>setCalendarSelection({member:currentMember,selected})}/>} commitments={readModel.commitments} nextCommitment={readModel.nextCommitment} health={calendarHealth} onOpenCalendar={onOpenCalendar} browsingDate={browsingDate} />

      {readModel.outcomes.length>0&&<section className="today-section today-outcomes"><div className="today-section-heading"><h2>Agreed daily outcomes</h2></div><ol className="today-top-three">{readModel.outcomes.map((outcome,index)=><li key={index}>{outcome.title}{outcome.owner&&<span>{outcome.owner}</span>}</li>)}</ol></section>}
      <section className="today-section today-actions"><div className="today-section-heading"><div><span>Personal View</span><h2>{currentMember}'s Actions</h2></div><small>Assignment edits open Action Mode review before changing the shared plan.</small></div>{readModel.actions.length ? <div className="today-assignment-list">{readModel.actions.map(item => <AssignmentEditor key={item.id} assignment={item} expectedVersion={Number(dailyPlan.version || 0)} readOnly={readOnly} onSave={(updated, version) => onReviewAssignment?.(item.id, updated, version)} />)}</div> : <div className="today-empty">{readModel.memberOutcomes.length ? `${currentMember} owns ${readModel.memberOutcomes.length} outcome${readModel.memberOutcomes.length===1?'':'s'} in Today’s Top 3, with no separate unresolved assignment.` : `No unresolved assignments or Top 3 outcomes currently involve ${currentMember}.`}</div>}</section>
    </section></details>

    {showDecisions && <div className="today-decision-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowDecisions(false) }}><section className="today-decision-dialog" role="dialog" aria-modal="true" aria-labelledby="today-decision-dialog-title"><header><div><span>Decision Queue</span><h2 id="today-decision-dialog-title">Decisions needing attention</h2><p>{readModel.counts.decisions} active {readModel.counts.decisions === 1 ? 'decision' : 'decisions'} for {formatDate(dailyPlan.date)}. A determined decision remains visible until its resulting work is complete.</p></div><button type="button" onClick={() => setShowDecisions(false)} aria-label="Close decision list"><i className="ti ti-x" /></button></header><div className="today-decision-dialog-list">{readModel.decisions.map((decision, index) => <DecisionEditor key={decision.id} decision={decision} number={index + 1} expectedVersion={Number(dailyPlan.version || 0)} readOnly={readOnly} onSave={(updated, version) => saveDecision(updated, decision.id, version)} />)}{!readModel.decisions.length && <div className="today-decision-all-clear"><i className="ti ti-circle-check" /><strong>All decisions are resolved.</strong><span>There are no remaining decisions needing attention.</span></div>}</div></section></div>}

    {editingFocus && <div className="today-decision-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setEditingFocus(false) }}><section className="today-focus-dialog" role="dialog" aria-modal="true" aria-labelledby="today-focus-dialog-title"><header><div><span>Household Management</span><h2 id="today-focus-dialog-title">Set Today’s Focus</h2><p>Choose the single focus the household should keep in view today. Calendar appointments remain visible below, but they will not replace this focus.</p></div><button type="button" onClick={() => setEditingFocus(false)} aria-label="Close Today’s Focus editor"><i className="ti ti-x" /></button></header><label><span>Today’s Focus</span><textarea autoFocus value={focusDraft} maxLength={240} onChange={event => { setFocusDraft(event.target.value); setFocusState('idle'); setFocusError('') }} placeholder="What should the household focus on today?" /></label>{focusError && <p className="today-decision-save-error">{focusError}</p>}<footer><small>{focusState === 'reviewing' ? 'Review and approve this change in Action Mode.' : 'Nothing changes until this exact plan version is approved in Action Mode.'}</small><div><button type="button" onClick={() => setEditingFocus(false)}>Cancel</button><button type="button" className="primary" onClick={reviewFocus} disabled={focusState === 'saving' || !focusDraft.trim()}><i className="ti ti-shield-check" /> {focusState === 'saving' ? 'Opening review…' : 'Review focus'}</button></div></footer></section></div>}

    <details className="today-supporting" open={browsingDate||undefined}><summary>Education, finance & ministry</summary>
    <PillarBrief number={5} pillar="education" title={educationCard.title} detail={educationCard.detail} meta={educationCard.meta} onOpenPillar={onOpenPillar} />

    <TodayFinanceBrief date={dailyPlan.date} finance={finance} canViewFinance={canViewFinance} onOpenFinance={onOpenPillar} />

    <PillarBrief number={7} pillar="ministry" title={ministryCard.title} detail={ministryCard.detail} meta={ministryCard.meta} prayerNeeds={ministryCard.prayerNeeds} onOpenPillar={onOpenPillar} />
    </details>


  </div>
}
