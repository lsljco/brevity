import { useMemo, useState } from 'react'
import { HOUSEHOLD_MEMBERS, normalizeDailyPlan } from './dailyPlan.js'
import TimedCommitmentsEditor from './TimedCommitmentsEditor.jsx'
import './MorningAlignment.css'

const STEPS = [
  ['spiritual', 'Spiritual Maturity', 'ti-sun'],
  ['health', 'Health & Nutrition', 'ti-heart'],
  ['fitness', 'Physical Fitness', 'ti-run'],
  ['household', 'Household Operations', 'ti-home'],
  ['education', 'Education / Think Tank', 'ti-book'],
  ['finance', 'Finances', 'ti-building-bank'],
  ['ministry', 'Ministry & Fellowship', 'ti-users'],
]

const splitLines = value => String(value || '').split('\n').map(item => item.trim()).filter(Boolean)
const joinLines = value => Array.isArray(value) ? value.join('\n') : ''

function Field({ label, children, hint }) {
  return <label className="alignment-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

function MemberChecks({ selected = [], onChange }) {
  const toggle = member => onChange(selected.includes(member) ? selected.filter(item => item !== member) : [...selected, member])
  return <div className="alignment-member-grid">{HOUSEHOLD_MEMBERS.map(member => <button type="button" key={member} className={selected.includes(member) ? 'is-selected' : ''} onClick={() => toggle(member)}>{member}</button>)}</div>
}

function SpiritualStep({ draft, update }) {
  const value = draft.spiritual
  return <div className="alignment-form-grid">
    <Field label="Scripture"><textarea value={joinLines(value.scripture)} onChange={e => update('spiritual', { scripture: splitLines(e.target.value) })} placeholder="One passage per line" /></Field>
    <Field label="Devotion focus"><textarea value={value.devotionFocus} onChange={e => update('spiritual', { devotionFocus: e.target.value })} placeholder="What is God emphasizing today?" /></Field>
    <Field label="Prayer focus"><textarea value={joinLines(value.prayerFocus)} onChange={e => update('spiritual', { prayerFocus: splitLines(e.target.value) })} placeholder="One prayer focus per line" /></Field>
    <Field label="Act of obedience"><textarea value={value.obedienceAction} onChange={e => update('spiritual', { obedienceAction: e.target.value })} placeholder="What will obedience look like today?" /></Field>
  </div>
}

function HealthStep({ draft, update }) {
  const value = draft.health
  return <div className="alignment-form-grid alignment-form-grid--two">
    <Field label="Breakfast"><input value={value.breakfast} onChange={e => update('health', { breakfast: e.target.value })} /></Field>
    <Field label="Lunch"><input value={value.lunch} onChange={e => update('health', { lunch: e.target.value })} /></Field>
    <Field label="Dinner"><input value={value.dinner} onChange={e => update('health', { dinner: e.target.value })} /></Field>
    <Field label="Snacks"><input value={value.snacks} onChange={e => update('health', { snacks: e.target.value })} /></Field>
    <Field label="Hydration"><input value={value.hydration} onChange={e => update('health', { hydration: e.target.value })} /></Field>
    <Field label="Tomorrow prep"><input value={value.nextDayPrep} onChange={e => update('health', { nextDayPrep: e.target.value })} /></Field>
    <Field label="Groceries" hint="One item per line"><textarea value={joinLines(value.groceries)} onChange={e => update('health', { groceries: splitLines(e.target.value) })} /></Field>
  </div>
}

function FitnessStep({ draft, update }) {
  const value = draft.fitness
  return <div className="alignment-form-grid alignment-form-grid--two">
    <Field label="Location"><input value={value.location} onChange={e => update('fitness', { location: e.target.value, requiresDecision: !e.target.value })} placeholder="Life Time Johns Creek, Buckhead, walk…" /></Field>
    <Field label="Workout"><input value={value.workout} onChange={e => update('fitness', { workout: e.target.value })} /></Field>
    <Field label="Objective"><input value={value.objective} onChange={e => update('fitness', { objective: e.target.value })} /></Field>
    <Field label="Step goal"><input type="number" value={value.stepGoal} onChange={e => update('fitness', { stepGoal: Number(e.target.value) || 0 })} /></Field>
    <Field label="Departure"><input type="time" value={value.departureTime} onChange={e => update('fitness', { departureTime: e.target.value })} /></Field>
    <Field label="Return"><input type="time" value={value.returnTime} onChange={e => update('fitness', { returnTime: e.target.value })} /></Field>
    <Field label="Participants"><MemberChecks selected={value.participants} onChange={participants => update('fitness', { participants })} /></Field>
    <Field label="Recovery"><input value={value.recovery} onChange={e => update('fitness', { recovery: e.target.value })} /></Field>
  </div>
}

function HouseholdStep({ draft, update }) {
  const value = draft.household
  return <div className="alignment-form-grid">
    <Field label="Today's Top Household Outcomes" hint="One outcome per line"><textarea value={joinLines(value.priorities.map(item => typeof item === 'string' ? item : item.title))} onChange={e => update('household', { priorities: splitLines(e.target.value).map((title, index) => ({ id: `household-priority-${index}`, title, owner: 'Larry', status: 'pending' })) })} /></Field>
    <Field label="Appointments" hint="Add date/time and keep Calendar on only when an Apple alert is useful">
      <TimedCommitmentsEditor items={value.appointments} planDate={draft.date} prefix="appointment" onChange={appointments => update('household', { appointments })} />
    </Field>
    <Field label="Errands"><textarea value={joinLines(value.errands)} onChange={e => update('household', { errands: splitLines(e.target.value) })} /></Field>
    <Field label="Open items / confirmations"><textarea value={joinLines(value.openItems)} onChange={e => update('household', { openItems: splitLines(e.target.value) })} /></Field>
  </div>
}

function EducationStep({ draft, update }) {
  const value = draft.education
  return <div className="alignment-form-grid alignment-form-grid--two">
    <Field label="Think Tank topic"><input value={value.thinkTankTopic} onChange={e => update('education', { thinkTankTopic: e.target.value })} /></Field>
    <Field label="Required deliverable"><input value={value.thinkTankDeliverable} onChange={e => update('education', { thinkTankDeliverable: e.target.value })} /></Field>
    <Field label="Isaiah reading minutes"><input type="number" value={value.isaiah.readingMinutes} onChange={e => update('education', { isaiah: { ...value.isaiah, readingMinutes: Number(e.target.value) || 0 } })} /></Field>
    <Field label="Isaiah supervising adult"><select value={value.isaiah.owner} onChange={e => update('education', { isaiah: { ...value.isaiah, owner: e.target.value } })}><option value="">Confirm owner</option>{HOUSEHOLD_MEMBERS.filter(m => m !== 'Isaiah').map(member => <option key={member}>{member}</option>)}</select></Field>
    <Field label="Isaiah notes"><textarea value={value.isaiah.notes} onChange={e => update('education', { isaiah: { ...value.isaiah, notes: e.target.value } })} /></Field>
  </div>
}

function FinanceStep({ draft, update }) {
  const value = draft.finance
  return <div className="alignment-form-grid">
    <Field label="Bills to review" hint="One per line"><textarea value={joinLines(value.bills.map(item => typeof item === 'string' ? item : item.title || item.name))} onChange={e => update('finance', { bills: splitLines(e.target.value).map((title, index) => ({ id: `bill-${index}`, title, status: 'pending' })) })} /></Field>
    <Field label="Purchases requiring decision"><textarea value={joinLines(value.purchases.map(item => typeof item === 'string' ? item : item.title))} onChange={e => update('finance', { purchases: splitLines(e.target.value).map((title, index) => ({ id: `purchase-${index}`, title, status: 'needs-decision' })) })} /></Field>
    <Field label="Transfers"><textarea value={joinLines(value.transfers.map(item => typeof item === 'string' ? item : item.title))} onChange={e => update('finance', { transfers: splitLines(e.target.value).map((title, index) => ({ id: `transfer-${index}`, title, status: 'pending' })) })} /></Field>
    <Field label="Accounts to fund"><textarea value={joinLines(value.accountsToFund.map(item => typeof item === 'string' ? item : item.title || item.account))} onChange={e => update('finance', { accountsToFund: splitLines(e.target.value).map((title, index) => ({ id: `fund-${index}`, title, status: 'needs-decision' })) })} /></Field>
    <Field label="Decision rule"><input value={value.decisionRule} onChange={e => update('finance', { decisionRule: e.target.value })} placeholder="No funding source = not approved" /></Field>
  </div>
}

function MinistryStep({ draft, update }) {
  const value = draft.ministry
  return <div className="alignment-form-grid">
    <Field label="Content / teaching focus"><textarea value={value.contentFocus} onChange={e => update('ministry', { contentFocus: e.target.value })} /></Field>
    <Field label="Meetings / ministry commitments" hint="Only keep Calendar enabled for fixed-time commitments">
      <TimedCommitmentsEditor items={value.meetings} planDate={draft.date} prefix="ministry-meeting" onChange={meetings => update('ministry', { meetings })} />
    </Field>
    <Field label="Fellowship follow-ups"><textarea value={joinLines(value.fellowshipFollowUps.map(item => typeof item === 'string' ? item : item.title))} onChange={e => update('ministry', { fellowshipFollowUps: splitLines(e.target.value).map((title, index) => ({ id: `fellowship-${index}`, title, status: 'pending' })) })} /></Field>
    <Field label="Prayer needs"><textarea value={joinLines(value.prayerNeeds)} onChange={e => update('ministry', { prayerNeeds: splitLines(e.target.value) })} /></Field>
  </div>
}

const STEP_COMPONENTS = { spiritual: SpiritualStep, health: HealthStep, fitness: FitnessStep, household: HouseholdStep, education: EducationStep, finance: FinanceStep, ministry: MinistryStep }

export default function MorningAlignment({ plan, onCancel, onComplete }) {
  const [draft, setDraft] = useState(() => normalizeDailyPlan(plan))
  const [stepIndex, setStepIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [id, label, icon] = STEPS[stepIndex]
  const Step = STEP_COMPONENTS[id]
  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100)

  const update = (section, patch) => setDraft(current => ({ ...current, [section]: { ...current[section], ...patch }, updatedAt: new Date().toISOString() }))
  const unresolved = useMemo(() => [!draft.health.dinner && 'Dinner', !draft.fitness.location && 'Gym/location', !draft.education.isaiah.owner && 'Isaiah education owner'].filter(Boolean), [draft])

  const finish = async () => {
    setSaving(true); setError('')
    try {
      await onComplete({ ...draft, morningAlignment: { ...draft.morningAlignment, completedAt: new Date().toISOString() } })
    } catch (err) {
      setError(err.message || 'Could not complete household alignment.')
      setSaving(false)
    }
  }

  return <div className="morning-alignment">
    <header className="morning-alignment-header">
      <div><span>Seven Pillars</span><h1>Morning Alignment</h1><p>Resolve the household's direction before food, fitness, errands, or outside activity.</p></div>
      <button type="button" onClick={onCancel}>Exit</button>
    </header>
    <div className="alignment-progress"><span style={{ width: `${progress}%` }} /></div>
    <nav className="alignment-step-nav" aria-label="Alignment progress">
      {STEPS.map(([stepId, stepLabel, stepIcon], index) => <button type="button" key={stepId} className={`${index === stepIndex ? 'is-active' : ''}${index < stepIndex ? ' is-complete' : ''}`} onClick={() => setStepIndex(index)}><i className={`ti ${stepIcon}`} /><span>{index + 1}</span><small>{stepLabel}</small></button>)}
    </nav>
    <section className="alignment-workspace">
      <div className="alignment-workspace-heading"><div className="alignment-step-icon"><i className={`ti ${icon}`} /></div><div><span>Pillar {stepIndex + 1} of {STEPS.length}</span><h2>{label}</h2></div></div>
      <Step draft={draft} update={update} />
    </section>
    {error && <div className="alignment-error">{error}</div>}
    <footer className="alignment-footer">
      <button type="button" className="alignment-secondary" disabled={stepIndex === 0 || saving} onClick={() => setStepIndex(i => i - 1)}>Previous</button>
      <div>{stepIndex === STEPS.length - 1 && unresolved.length > 0 && <span className="alignment-unresolved">Still open: {unresolved.join(' · ')}</span>}</div>
      {stepIndex < STEPS.length - 1 ? <button type="button" className="alignment-primary" onClick={() => setStepIndex(i => i + 1)}>Next Pillar</button> : <button type="button" className="alignment-primary" disabled={saving} onClick={finish}>{saving ? 'Saving…' : 'Complete Alignment'}</button>}
    </footer>
  </div>
}
