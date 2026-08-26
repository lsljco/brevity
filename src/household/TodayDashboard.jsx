import { useEffect, useState } from 'react'
import './TodayDashboard.css'
import { HOUSEHOLD_MEMBERS, ITEM_STATUS, countOpenDecisions, assignmentsForMember, normalizeDailyPlan } from './dailyPlan.js'
import DailyCommandSchedule from './DailyCommandSchedule.jsx'

const PILLARS = [
  ['spiritual', 'Spiritual Maturity', 'ti-sun'],
  ['health', 'Health & Nutrition', 'ti-heart'],
  ['fitness', 'Physical Fitness', 'ti-run'],
  ['household', 'Household Management', 'ti-home'],
  ['education', 'Education / Think Tank', 'ti-book'],
  ['finance', 'Finance', 'ti-building-bank'],
  ['ministry', 'Ministry & Fellowship', 'ti-users'],
]

const arrayLength = value => Array.isArray(value) ? value.length : 0

function formatDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function PillarCard({ id, label, icon, plan, calendarAppointmentCount = 0 }) {
  const value = plan?.[id] || {}
  const summaries = {
    spiritual: value.devotionFocus || 'Devotion focus needs confirmation',
    health: value.dinner ? `Dinner: ${value.dinner}` : 'Meal plan needs attention',
    fitness: value.location ? `${value.location}${value.workout ? ` · ${value.workout}` : ''}` : 'Location and workout need decision',
    household: `${calendarAppointmentCount || arrayLength(value.appointments)} appointments · ${arrayLength(value.priorities)} priorities`,
    education: value.thinkTankTopic || 'Think Tank topic needs confirmation',
    finance: `${arrayLength(value.bills)} bills · ${arrayLength(value.transfers)} transfers · ${arrayLength(value.accountsToFund)} funding decisions`,
    ministry: `${arrayLength(value.meetings)} meetings · ${arrayLength(value.fellowshipFollowUps)} follow-ups`,
  }

  return <article className="today-pillar-card"><div className="today-pillar-icon"><i className={`ti ${icon}`} /></div><div><span className="today-pillar-label">{label}</span><strong>{summaries[id] || 'Needs confirmation'}</strong></div></article>
}

function TodayCalendarAgenda({ appointments, connected, onOpenCalendar }) {
  return <section className="today-section today-calendar-agenda">
    <div className="today-section-heading"><div><span>Live Calendar</span><h2>Today’s Calendar</h2></div><button type="button" className="today-calendar-open" onClick={onOpenCalendar}>Open Family Calendar <i className="ti ti-arrow-right" aria-hidden="true" /></button></div>
    {appointments.length ? <div className="today-calendar-list">{appointments.map(item => <article className="today-calendar-item" key={item.id || `${item.title}-${item.startTime}`}>
      <time>{item.startTime || 'All day'}</time>
      <div><strong>{item.title}</strong><span>{item.owner || 'Family'} · {item.calendarSource === 'icloud' ? 'Apple Family Calendar' : 'Brevity'}</span></div>
      {item.priority === 'high' || item.priority === 'critical' ? <em>Priority</em> : null}
    </article>)}</div> : <div className="today-calendar-empty"><i className={`ti ${connected ? 'ti-calendar-check' : 'ti-calendar-off'}`} aria-hidden="true" /><div><strong>{connected ? 'No calendar commitments today' : 'Calendar connection is still loading'}</strong><span>{connected ? 'The Apple Family Calendar has no events scheduled for this date.' : 'Brevity will place today’s Apple appointments here after the calendar refresh completes.'}</span></div></div>}
  </section>
}

function DecisionEditor({ decision, number, onSave }) {
  const [draft, setDraft] = useState(() => ({ ...decision, owner: decision.owner || 'Family', status: decision.status || ITEM_STATUS.needsDecision }))
  const [saveState, setSaveState] = useState('idle')
  const [error, setError] = useState('')
  const update = (field, value) => setDraft(current => ({ ...current, [field]: value }))
  const save = async () => {
    setSaveState('saving')
    setError('')
    try {
      await onSave(draft)
      setSaveState('saved')
    } catch (saveError) {
      setSaveState('error')
      setError(saveError.message || 'Could not save this decision.')
    }
  }

  return <article className="today-decision-editor"><div className="today-decision-editor-heading"><span>{String(number).padStart(2, '0')}</span><label><span>Decision</span><input value={draft.title || ''} onChange={event => update('title', event.target.value)} /></label></div><label><span>Update / resolution</span><textarea value={draft.notes || ''} onChange={event => update('notes', event.target.value)} placeholder="Enter the decision, answer, or update needed…" /></label><div className="today-decision-editor-fields"><label><span>Owner</span><select value={draft.owner} onChange={event => update('owner', event.target.value)}><option>Family</option>{HOUSEHOLD_MEMBERS.map(member => <option key={member}>{member}</option>)}</select></label><label><span>Status</span><select value={draft.status} onChange={event => update('status', event.target.value)}><option value={ITEM_STATUS.needsDecision}>Needs decision</option><option value={ITEM_STATUS.pending}>Open</option><option value={ITEM_STATUS.ready}>Ready</option><option value={ITEM_STATUS.inProgress}>In progress</option><option value={ITEM_STATUS.complete}>Complete</option><option value={ITEM_STATUS.deferred}>Deferred</option></select></label></div>{error && <p className="today-decision-save-error">{error}</p>}<footer><small>{saveState === 'saved' ? 'Update saved' : 'Changes save to the shared household plan.'}</small><button type="button" onClick={save} disabled={saveState === 'saving' || !draft.title?.trim()}><i className={`ti ${saveState === 'saved' ? 'ti-check' : 'ti-device-floppy'}`} /> {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save update'}</button></footer></article>
}

export default function TodayDashboard({ plan, calendarAppointments = [], calendarConnected = false, currentMember = 'Larry', onStartAlignment, onStartRecap, onOpenPillar, onOpenCalendar, onGeneratePlan, onSavePlan, generationState = 'idle' }) {
  const dailyPlan = normalizeDailyPlan(plan)
  const attentionDecisions = dailyPlan.decisions.filter(decision => decision?.status !== 'complete' && decision?.status !== 'deferred')
  const openDecisions = countOpenDecisions(dailyPlan)
  const [showDecisions, setShowDecisions] = useState(false)
  const myAssignments = assignmentsForMember(dailyPlan, currentMember)
  const aligned = Boolean(dailyPlan.morningAlignment?.completedAt)
  const closed = Boolean(dailyPlan.recap?.completedAt)
  const generated = dailyPlan.generatedBy === 'brevity-daily-household-plan'

  const saveDecision = async (updatedDecision, decisionIndex) => {
    const nextPlan = {
      ...dailyPlan,
      updatedAt: new Date().toISOString(),
      decisions: dailyPlan.decisions.map((decision, index) => index === decisionIndex ? { ...decision, ...updatedDecision } : decision),
    }
    await onSavePlan?.(nextPlan)
  }

  useEffect(() => {
    if (!showDecisions) return undefined
    const closeOnEscape = event => {
      if (event.key === 'Escape') setShowDecisions(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [showDecisions])

  return <div className="today-dashboard">
    <header className="today-hero">
      <div><p className="today-kicker">Household Command Center</p><h1>Today</h1><p>{formatDate(dailyPlan.date)}</p></div>
      <div className="today-hero-actions">
        <button className="today-alignment-button" onClick={onGeneratePlan} disabled={generationState === 'generating'}><i className="ti ti-sparkles" /> {generationState === 'generating' ? 'Generating…' : generated ? 'Refresh Daily Plan' : 'Generate Daily Plan'}</button>
        <button className="today-alignment-button" onClick={onStartAlignment}><i className="ti ti-target-arrow" /> {aligned ? 'Review Alignment' : 'Start Alignment'}</button>
        <button className="today-alignment-button today-alignment-button--secondary" onClick={onStartRecap}><i className="ti ti-clipboard-check" /> {closed ? 'Review Recap' : 'Close Today'}</button>
      </div>
    </header>

    <section className="today-focus-card"><div><span>Today's Focus</span><h2>{dailyPlan.theme || 'Set today’s household focus'}</h2>{dailyPlan.dayObjective && <p>{dailyPlan.dayObjective}</p>}{dailyPlan.governingPrinciple && <p>{dailyPlan.governingPrinciple}</p>}</div><button type="button" className="today-decision-count" onClick={() => setShowDecisions(true)} disabled={!openDecisions} aria-haspopup="dialog" aria-expanded={showDecisions}><strong>{openDecisions}</strong><span>{openDecisions === 1 ? 'decision needs attention' : 'decisions need attention'}</span><i className="ti ti-chevron-right" aria-hidden="true" /></button></section>

    {showDecisions && <div className="today-decision-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowDecisions(false) }}><section className="today-decision-dialog" role="dialog" aria-modal="true" aria-labelledby="today-decision-dialog-title"><header><div><span>Decision Board</span><h2 id="today-decision-dialog-title">Decisions needing attention</h2><p>{openDecisions} open {openDecisions === 1 ? 'decision' : 'decisions'} for {formatDate(dailyPlan.date)}. Enter the update and mark it complete when resolved.</p></div><button type="button" onClick={() => setShowDecisions(false)} aria-label="Close decision list"><i className="ti ti-x" /></button></header><div className="today-decision-dialog-list">{attentionDecisions.map((decision, index) => <DecisionEditor key={decision.id || `${decision.title}-${index}`} decision={decision} number={index + 1} onSave={updated => saveDecision(updated, dailyPlan.decisions.indexOf(decision))} />)}{!attentionDecisions.length && <div className="today-decision-all-clear"><i className="ti ti-circle-check" /><strong>All decisions are resolved.</strong><span>There are no remaining decisions needing attention.</span></div>}</div></section></div>}

    <TodayCalendarAgenda appointments={calendarAppointments} connected={calendarConnected} onOpenCalendar={onOpenCalendar} />

    <DailyCommandSchedule plan={dailyPlan} />

    <section className="today-section"><div className="today-section-heading"><div><span>Seven Pillars</span><h2>Household Status</h2></div><small>Brevity combines its operating plan with live calendar commitments.</small></div><div className="today-pillar-grid">{PILLARS.map(([id, label, icon]) => <button key={id} className="today-pillar-button" onClick={() => onOpenPillar?.(id)}><PillarCard id={id} label={label} icon={icon} plan={dailyPlan} calendarAppointmentCount={id === 'household' ? calendarAppointments.length : 0} /></button>)}</div></section>

    <section className="today-section"><div className="today-section-heading"><div><span>Ownership</span><h2>{currentMember}'s Day</h2></div><small>Only assignments owned by or explicitly involving this household member.</small></div>{myAssignments.length ? <div className="today-assignment-list">{myAssignments.map(item => <div className="today-assignment" key={item.id}><div><strong>{item.title}</strong>{item.notes && <span>{item.notes}</span>}</div><span className={`today-status today-status--${item.status}`}>{item.status}</span></div>)}</div> : <div className="today-empty">No assignments have been assigned to {currentMember} yet.</div>}</section>

    <section className="today-section"><div className="today-section-heading"><div><span>Daily Outcomes</span><h2>Top 3</h2></div><small>Outcomes, not generic tasks.</small></div><ol className="today-top-three">{[0,1,2].map(index => <li key={index}>{dailyPlan.topPriorities?.[index]?.title || 'Priority not set'}</li>)}</ol></section>
  </div>
}
