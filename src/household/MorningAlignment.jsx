import { useEffect, useMemo, useRef, useState } from 'react'
import { HOUSEHOLD_MEMBERS, normalizeDailyPlan } from './dailyPlan.js'
import TimedCommitmentsEditor from './TimedCommitmentsEditor.jsx'
import SpiritualFormationStudio from './SpiritualFormationStudio.jsx'
import HealthAlertBanner from './HealthAlertBanner.jsx'
import { compactEditableLines, compactTitledItems, joinEditableLines, splitEditableLines } from './lineEditing.js'
import './MorningAlignment.css'
import './MorningAlignmentAutosave.css'

const STEPS = [
  ['spiritual', 'Spiritual Maturity', 'ti-sun'],
  ['health', 'Health & Nutrition', 'ti-heart'],
  ['fitness', 'Physical Fitness', 'ti-run'],
  ['household', 'Household Operations', 'ti-home'],
  ['education', 'Education / Think Tank', 'ti-book'],
  ['finance', 'Finances', 'ti-building-bank'],
  ['ministry', 'Ministry & Fellowship', 'ti-users'],
]

const splitLines = splitEditableLines
const joinLines = joinEditableLines

const cleanLineLists = draft => ({
  ...draft,
  spiritual: {
    ...draft.spiritual,
    scripture: compactEditableLines(draft.spiritual.scripture),
    prayerFocus: compactEditableLines(draft.spiritual.prayerFocus),
  },
  health: { ...draft.health, groceries: compactEditableLines(draft.health.groceries) },
  household: {
    ...draft.household,
    priorities: compactTitledItems(draft.household.priorities),
    errands: compactEditableLines(draft.household.errands),
    openItems: compactEditableLines(draft.household.openItems),
  },
  finance: {
    ...draft.finance,
    bills: compactTitledItems(draft.finance.bills),
    purchases: compactTitledItems(draft.finance.purchases),
    transfers: compactTitledItems(draft.finance.transfers),
    accountsToFund: compactTitledItems(draft.finance.accountsToFund),
  },
  ministry: {
    ...draft.ministry,
    fellowshipFollowUps: compactTitledItems(draft.ministry.fellowshipFollowUps),
    prayerNeeds: compactEditableLines(draft.ministry.prayerNeeds),
  },
})

function Field({ label, children, hint }) {
  return <label className="alignment-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

function MemberChecks({ selected = [], onChange }) {
  const toggle = member => onChange(selected.includes(member) ? selected.filter(item => item !== member) : [...selected, member])
  return <div className="alignment-member-grid">{HOUSEHOLD_MEMBERS.map(member => <button type="button" key={member} className={selected.includes(member) ? 'is-selected' : ''} onClick={() => toggle(member)}>{member}</button>)}</div>
}

function HealthStep({ draft, update, onOpenMealPlan }) {
  const value = draft.health
  return <><HealthAlertBanner/><div className="alignment-form-grid alignment-form-grid--two">
    {value.mealPlanSource === 'rolling' && <div className="alignment-meal-plan-notice"><div><i className="ti ti-calendar-check" /><span><strong>Brevity supplied today’s meals.</strong><small>Use the rolling plan to choose from 30 replacements for any meal.</small></span></div><button type="button" onClick={onOpenMealPlan}>Open Meal Plan</button></div>}
    <Field label="Breakfast"><input readOnly={value.mealPlanSource === 'rolling'} value={value.breakfast} onChange={e => update('health', { breakfast: e.target.value })} /></Field>
    <Field label="Lunch"><input readOnly={value.mealPlanSource === 'rolling'} value={value.lunch} onChange={e => update('health', { lunch: e.target.value })} /></Field>
    <Field label="Dinner"><input readOnly={value.mealPlanSource === 'rolling'} value={value.dinner} onChange={e => update('health', { dinner: e.target.value })} /></Field>
    <Field label="Snacks"><input value={value.snacks} onChange={e => update('health', { snacks: e.target.value })} /></Field>
    <Field label="Hydration"><input value={value.hydration} onChange={e => update('health', { hydration: e.target.value })} /></Field>
    <Field label="Tomorrow prep"><input value={value.nextDayPrep} onChange={e => update('health', { nextDayPrep: e.target.value })} /></Field>
    <Field label="Groceries" hint="One item per line"><textarea value={joinLines(value.groceries)} onChange={e => update('health', { groceries: splitLines(e.target.value) })} /></Field>
  </div></>
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

const STEP_COMPONENTS = { spiritual: SpiritualFormationStudio, health: HealthStep, fitness: FitnessStep, household: HouseholdStep, education: EducationStep, finance: FinanceStep, ministry: MinistryStep }

export default function MorningAlignment({ plan, onSaveDraft, onCancel, onComplete, onOpenMealPlan }) {
  const [draft, setDraft] = useState(() => normalizeDailyPlan(plan))
  const [stepIndex, setStepIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draftSaveState, setDraftSaveState] = useState('saved')
  const autosaveReady = useRef(false)
  const exiting = useRef(false)
  const saveChain = useRef(Promise.resolve())
  const saveDraftRef = useRef(onSaveDraft)
  const [id, label, icon] = STEPS[stepIndex]
  const Step = STEP_COMPONENTS[id]
  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100)

  const update = (section, patch) => setDraft(current => ({ ...current, [section]: { ...current[section], ...patch }, updatedAt: new Date().toISOString() }))
  const unresolved = useMemo(() => [!draft.health.dinner && 'Dinner', !draft.fitness.location && 'Gym/location', !draft.education.isaiah.owner && 'Isaiah education owner'].filter(Boolean), [draft])

  useEffect(() => { saveDraftRef.current = onSaveDraft }, [onSaveDraft])

  useEffect(() => {
    if (exiting.current) return
    if (!autosaveReady.current) { autosaveReady.current = true; return }
    if (!saveDraftRef.current) return
    setDraftSaveState('pending')
    const snapshot = draft
    const timer = setTimeout(() => {
      if (exiting.current) return
      setDraftSaveState('saving')
      saveChain.current = saveChain.current
        .catch(() => undefined)
        .then(() => saveDraftRef.current(snapshot))
        .then(() => setDraftSaveState('saved'))
        .catch(err => { setDraftSaveState('error'); setError(err.message || 'Draft autosave failed.') })
    }, 900)
    return () => clearTimeout(timer)
  }, [draft])

  const saveAndExit = async () => {
    if (!saveDraftRef.current) { onCancel(); return }
    exiting.current = true
    setSaving(true); setError('')
    try {
      await saveChain.current.catch(() => undefined)
      await saveDraftRef.current(draft)
      onCancel()
    } catch (err) {
      exiting.current = false
      setError(err.message || 'Could not save this alignment draft.')
      setSaving(false)
    }
  }

  const finish = async () => {
    exiting.current = true
    setSaving(true); setError('')
    try {
      await saveChain.current.catch(() => undefined)
      const cleanedDraft = cleanLineLists(draft)
      await onComplete({ ...cleanedDraft, morningAlignment: { ...cleanedDraft.morningAlignment, completedAt: new Date().toISOString() } })
    } catch (err) {
      exiting.current = false
      setError(err.message || 'Could not complete household alignment.')
      setSaving(false)
    }
  }

  return <div className="morning-alignment">
    <header className="morning-alignment-header">
      <div><span>Seven Pillars</span><h1>Morning Alignment</h1><p>Resolve the household's direction before food, fitness, errands, or outside activity.</p></div>
      <div className="alignment-header-actions"><span className={`alignment-save-state alignment-save-state--${draftSaveState}`}>{draftSaveState==='pending'?'Changes pending':draftSaveState==='saving'?'Saving…':draftSaveState==='error'?'Save needs attention':'Draft saved'}</span><button type="button" disabled={saving} onClick={saveAndExit}>Save &amp; Exit</button></div>
    </header>
    <div className="alignment-progress"><span style={{ width: `${progress}%` }} /></div>
    <nav className="alignment-step-nav" aria-label="Alignment progress">
      {STEPS.map(([stepId, stepLabel, stepIcon], index) => <button type="button" key={stepId} className={`${index === stepIndex ? 'is-active' : ''}${index < stepIndex ? ' is-complete' : ''}`} onClick={() => setStepIndex(index)}><i className={`ti ${stepIcon}`} /><span>{index + 1}</span><small>{stepLabel}</small></button>)}
    </nav>
    <section className="alignment-workspace">
      <div className="alignment-workspace-heading"><div className="alignment-step-icon"><i className={`ti ${icon}`} /></div><div><span>Pillar {stepIndex + 1} of {STEPS.length}</span><h2>{label}</h2></div></div>
      <Step draft={draft} update={update} onOpenMealPlan={onOpenMealPlan} />
    </section>
    {error && <div className="alignment-error">{error}</div>}
    <footer className="alignment-footer">
      <button type="button" className="alignment-secondary" disabled={stepIndex === 0 || saving} onClick={() => setStepIndex(i => i - 1)}>Previous</button>
      <div>{stepIndex === STEPS.length - 1 && unresolved.length > 0 && <span className="alignment-unresolved">Still open: {unresolved.join(' · ')}</span>}</div>
      {stepIndex < STEPS.length - 1 ? <button type="button" className="alignment-primary" onClick={() => setStepIndex(i => i + 1)}>Next Pillar</button> : <button type="button" className="alignment-primary" disabled={saving} onClick={finish}>{saving ? 'Saving…' : 'Complete Alignment'}</button>}
    </footer>
  </div>
}
