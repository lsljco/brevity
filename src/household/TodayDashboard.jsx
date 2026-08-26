import { useEffect, useMemo, useState } from 'react'
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

const statusLabel = value => String(value || 'pending').replace(/-/g, ' ')

function AttentionPanel({ signals, onOpenCalendar }) {
  if (!signals.length) return <section className="today-attention today-attention--clear"><i className="ti ti-circle-check" aria-hidden="true" /><div><strong>No critical exceptions</strong><span>Brevity has not identified an unresolved operational risk for today.</span></div></section>

  return <section className="today-attention" aria-labelledby="today-attention-title">
    <header><div><span>Act First</span><h2 id="today-attention-title">Needs Attention</h2></div><strong>{signals.length}</strong></header>
    <div className="today-attention-list">{signals.map(signal => <article key={signal.id} className={`today-attention-item today-attention-item--${signal.priority}`}>
      <i className={`ti ${signal.source.system === 'integration' ? 'ti-plug-connected-x' : 'ti-alert-triangle'}`} aria-hidden="true" />
      <div><strong>{signal.title}</strong><span>{signal.detail}</span><small>{signal.owner} · {PILLAR_META[signal.pillar]?.[0] || 'Household'}</small></div>
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

function DecisionEditor({ decision, number, onSave }) {
  const [draft, setDraft] = useState(() => ({ title: decision.title, notes: decision.detail, owner: decision.owner || 'Family', status: decision.state || DECISION_STATUS.needsDecision }))
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

  return <article className="today-decision-editor"><div className="today-decision-editor-heading"><span>{String(number).padStart(2, '0')}</span><label><span>Decision</span><input value={draft.title || ''} onChange={event => update('title', event.target.value)} /></label></div><label><span>Update / resolution</span><textarea value={draft.notes || ''} onChange={event => update('notes', event.target.value)} placeholder="Enter the decision, answer, or update needed…" /></label><div className="today-decision-editor-fields"><label><span>Owner</span><select value={draft.owner} onChange={event => update('owner', event.target.value)}><option>Family</option>{HOUSEHOLD_MEMBERS.map(member => <option key={member}>{member}</option>)}</select></label><label><span>Status</span><select value={draft.status} onChange={event => update('status', event.target.value)}>{DECISION_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>{error && <p className="today-decision-save-error">{error}</p>}<footer><small>{saveState === 'saved' ? 'Update saved' : 'Changes save to the shared household plan.'}</small><button type="button" onClick={save} disabled={saveState === 'saving' || !draft.title?.trim()}><i className={`ti ${saveState === 'saved' ? 'ti-check' : 'ti-device-floppy'}`} /> {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save update'}</button></footer></article>
}

function PillarPulse({ items, onOpenPillar }) {
  return <section className="today-section today-pulse"><div className="today-section-heading"><div><span>Seven Pillars</span><h2>Household Pulse</h2></div><small>Exceptions and readiness—not seven separate reports.</small></div><div className="today-pillar-grid">{items.map(item => {
    const [label, icon] = PILLAR_META[item.pillar]
    return <button key={item.pillar} className="today-pillar-button" onClick={() => onOpenPillar?.(item.pillar)}><article className={`today-pillar-card today-pillar-card--${item.state}`}><div className="today-pillar-icon"><i className={`ti ${icon}`} /></div><div><span className="today-pillar-label">{label}</span><strong>{item.summary}</strong></div>{item.state === 'attention' ? <em>{item.attentionCount}</em> : <i className="ti ti-check" aria-label="Ready" />}</article></button>
  })}</div></section>
}

export default function TodayDashboard({ plan, calendarAppointments = [], calendarHealth, currentMember = 'Larry', onStartAlignment, onStartRecap, onOpenPillar, onOpenCalendar, onGeneratePlan, onSavePlan, generationState = 'idle' }) {
  const dailyPlan = useMemo(() => normalizeDailyPlan(plan), [plan])
  const readModel = useMemo(() => buildTodayReadModel({ plan: dailyPlan, calendarAppointments, calendarHealth, currentMember }), [calendarAppointments, calendarHealth, currentMember, dailyPlan])
  const [showDecisions, setShowDecisions] = useState(false)
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
    const closeOnEscape = event => { if (event.key === 'Escape') setShowDecisions(false) }
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

    <AttentionPanel signals={readModel.signals} onOpenCalendar={onOpenCalendar} />

    <section className="today-focus-card"><div><span>Today's Focus</span><h2>{readModel.theme || 'Set today’s household focus'}</h2>{readModel.objective && <p>{readModel.objective}</p>}{readModel.governingPrinciple && <p>{readModel.governingPrinciple}</p>}</div><button type="button" className="today-decision-count" onClick={() => setShowDecisions(true)} disabled={!readModel.counts.decisions} aria-haspopup="dialog" aria-expanded={showDecisions}><strong>{readModel.counts.decisions}</strong><span>{readModel.counts.decisions === 1 ? 'decision needs attention' : 'decisions need attention'}</span><i className="ti ti-chevron-right" aria-hidden="true" /></button></section>

    {showDecisions && <div className="today-decision-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowDecisions(false) }}><section className="today-decision-dialog" role="dialog" aria-modal="true" aria-labelledby="today-decision-dialog-title"><header><div><span>Decision Queue</span><h2 id="today-decision-dialog-title">Decisions needing attention</h2><p>{readModel.counts.decisions} active {readModel.counts.decisions === 1 ? 'decision' : 'decisions'} for {formatDate(dailyPlan.date)}. A determined decision remains visible until its resulting work is complete.</p></div><button type="button" onClick={() => setShowDecisions(false)} aria-label="Close decision list"><i className="ti ti-x" /></button></header><div className="today-decision-dialog-list">{readModel.decisions.map((decision, index) => <DecisionEditor key={decision.id} decision={decision} number={index + 1} onSave={updated => saveDecision(updated, decision.sourceIndex)} />)}{!readModel.decisions.length && <div className="today-decision-all-clear"><i className="ti ti-circle-check" /><strong>All decisions are resolved.</strong><span>There are no remaining decisions needing attention.</span></div>}</div></section></div>}

    <TodayCalendarAgenda commitments={readModel.commitments} nextCommitment={readModel.nextCommitment} health={calendarHealth} onOpenCalendar={onOpenCalendar} />

    <section className="today-section today-outcomes"><div className="today-section-heading"><div><span>Daily Outcomes</span><h2>Today’s Top 3</h2></div><small>Outcomes that make today successful—not a general task list.</small></div><ol className="today-top-three">{[0,1,2].map(index => <li key={index} className={readModel.outcomes[index] ? '' : 'today-top-three--empty'}>{readModel.outcomes[index]?.title || 'Outcome not set'}{readModel.outcomes[index]?.owner && <span>{readModel.outcomes[index].owner}</span>}</li>)}</ol></section>

    <section className="today-section today-actions"><div className="today-section-heading"><div><span>Ownership</span><h2>{currentMember}'s Actions</h2></div><small>Only unresolved work owned by or explicitly involving {currentMember}.</small></div>{readModel.actions.length ? <div className="today-assignment-list">{readModel.actions.map(item => <div className="today-assignment" key={item.id}><div><strong>{item.title}</strong>{item.detail && <span>{item.detail}</span>}</div><span className={`today-status today-status--${item.state}`}>{statusLabel(item.state)}</span></div>)}</div> : <div className="today-empty">No unresolved assignments are owned by {currentMember}.</div>}</section>

    <PillarPulse items={readModel.pillarPulse} onOpenPillar={onOpenPillar} />

    <DailyCommandSchedule plan={dailyPlan} showDecisions={false} />
  </div>
}
