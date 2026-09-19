import { useEffect, useRef, useState } from 'react'
import { PRACTICE_ADULTS, PRACTICE_STATUSES, blankMealReadiness, practiceRoutineNotes, shiftPracticeDate, validPracticeTime } from './operatingPractices.js'

export function PracticeDialog({ title, children, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    ref.current?.querySelector('input,select,textarea,button')?.focus()
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const elements = [...(ref.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') || [])]
      const first = elements[0], last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    const node = ref.current
    node?.addEventListener('keydown', key)
    return () => { node?.removeEventListener('keydown', key); previous?.focus?.() }
  }, [onClose])
  return <div className="practice-dialog-backdrop"><section ref={ref} className="practice-dialog" role="dialog" aria-modal="true" aria-label={title}>
    <header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close practice editor">Close</button></header>{children}
  </section></div>
}
const Adult = ({ label, value, onChange, required = false }) => <label><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)} required={required}><option value="">Choose an agreed owner</option>{PRACTICE_ADULTS.map(name => <option key={name}>{name}</option>)}</select></label>
function ReviewFooter({ busy, error, disabled = false }) {
  return <footer><p>Nothing changes until you approve the exact changes in Action Mode. Permissions, version checks, Audit History and Undo still apply.</p>{error && <p role="alert" className="practice-error">{error}</p>}<button className="practice-primary" type="submit" disabled={disabled || busy}>{busy ? 'Opening review…' : 'Review change'}</button></footer>
}
function useReview(onReview) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const review = async value => { setBusy(true); setError(''); try { await onReview(value) } catch (failure) { setError(failure.message || 'The review could not be opened.') } finally { setBusy(false) } }
  return { busy, error, review, setError }
}

export function PracticeAgreementEditor({ template, practice, date, onReview, onClose }) {
  const [draft, setDraft] = useState(() => ({
    title: practice?.routine.title || template.title,
    owner: practice?.routine.owner || '', backup: practice?.backup || '',
    startTime: practice?.routine.startTime || '', endTime: practice?.routine.endTime || '',
    days: practice?.routine.days || [0, 1, 2, 3, 4, 5, 6],
    effectiveDate: practice?.effectiveDate || date, reviewDate: practice?.reviewDate || shiftPracticeDate(date, 7),
    procedure: practice?.procedure || `${template.standard} Procedure: ${template.steps} Complete when: ${template.outcome}`,
    enabled: practice?.routine.enabled ?? true, agreed: false,
  }))
  const set = (field, value) => setDraft(previous => ({ ...previous, [field]: value }))
  const { busy, error, review, setError } = useReview(onReview)
  const submit = event => {
    event.preventDefault()
    if (!draft.agreed || !draft.owner || !draft.backup || draft.owner === draft.backup || !validPracticeTime(draft.startTime) || !validPracticeTime(draft.endTime) || draft.endTime <= draft.startTime || !draft.days.length) return
    let notes
    try { notes = practiceRoutineNotes({ policyId: template.id, revision: (practice?.revision || 0) + 1, ...draft }) }
    catch (failure) { setError(failure.message); return }
    review({ title: draft.title, owner: draft.owner, participants: [], startTime: draft.startTime, endTime: draft.endTime, days: draft.days, pillar: template.pillar, enabled: draft.enabled, notes })
  }
  const valid = draft.agreed && draft.owner && draft.backup && draft.owner !== draft.backup && draft.days.length && validPracticeTime(draft.startTime) && validPracticeTime(draft.endTime) && draft.endTime > draft.startTime
  return <PracticeDialog title={practice ? `Revise ${template.id}` : `Activate ${template.id}`} onClose={onClose}><form onSubmit={submit}>
    <p>{template.purpose} Activation creates a real Schedule routine, not another detached policy document. Proposed times and owners are not saved automatically.</p>
    <label><span>Agreement title</span><input value={draft.title} onChange={event => set('title', event.target.value)} maxLength={180} required /></label>
    <div className="practice-form-grid"><Adult label="Accountable owner" value={draft.owner} onChange={value => set('owner', value)} required /><Adult label="Agreed backup" value={draft.backup} onChange={value => set('backup', value)} required />
      <label><span>Routine starts</span><input type="time" value={draft.startTime} onChange={event => set('startTime', event.target.value)} required /></label><label><span>Routine ends</span><input type="time" value={draft.endTime} onChange={event => set('endTime', event.target.value)} required /></label>
      <label><span>Effective date</span><input type="date" value={draft.effectiveDate} onChange={event => set('effectiveDate', event.target.value)} required /></label><label><span>Next policy review</span><input type="date" value={draft.reviewDate} min={draft.effectiveDate} onChange={event => set('reviewDate', event.target.value)} required /></label></div>
    <fieldset><legend>Days for this routine</legend><div className="practice-days">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => <label key={day}><input type="checkbox" checked={draft.days.includes(index)} onChange={event => set('days', event.target.checked ? [...draft.days, index].sort() : draft.days.filter(item => item !== index))} />{day}</label>)}</div></fieldset>
    <label><span>Procedure and definition of complete</span><textarea rows={6} maxLength={1300} value={draft.procedure} onChange={event => set('procedure', event.target.value)} required /></label>
    <label className="practice-check"><input type="checkbox" checked={draft.enabled} onChange={event => set('enabled', event.target.checked)} />Keep this practice active</label>
    <label className="practice-check"><input type="checkbox" checked={draft.agreed} onChange={event => set('agreed', event.target.checked)} />I have discussed capacity, timing and backup coverage with the affected adults. Review this agreement; do not silently assign it.</label>
    {draft.owner && draft.owner === draft.backup && <p role="alert">Choose a different person for backup coverage.</p>}
    <p>Use Schedule for a one-date timing or coverage change. Revising the standing agreement is a separate reviewed action; historical check-in snapshots are retained.</p>
    <ReviewFooter busy={busy} error={error} disabled={!valid} />
  </form></PracticeDialog>
}

export function PracticeCheckinEditor({ card, onReview, onClose }) {
  const [status, setStatus] = useState(card.checkin?.revision === card.practice.revision ? card.checkin.status : 'unrecorded')
  const [note, setNote] = useState(card.checkin?.revision === card.practice.revision ? card.checkin.note : ''), [recovery, setRecovery] = useState(card.checkin?.revision === card.practice.revision ? card.checkin.recovery : '')
  const { busy, error, review } = useReview(onReview)
  const needsReason = status === 'blocked' || status === 'exception'
  return <PracticeDialog title={`Check in: ${card.template.title}`} onClose={onClose}><form onSubmit={event => { event.preventDefault(); review({ status, note, recovery }) }}>
    <p>{card.practice.procedure}</p><p>Owner: {card.practice.routine.owner} · Backup: {card.practice.backup}</p>
    <label><span>Recorded result</span><select value={status} onChange={event => setStatus(event.target.value)}>{PRACTICE_STATUSES.map(value => <option key={value} value={value}>{{ unrecorded: 'Not yet recorded', complete: 'Completion reported', blocked: 'Blocked — support needed', exception: 'Exception to the plan' }[value]}</option>)}</select></label>
    <label><span>What happened?</span><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1200} required={needsReason} rows={3} /></label>
    <label><span>Recovery action, owner and timing</span><textarea value={recovery} onChange={event => setRecovery(event.target.value)} maxLength={600} required={needsReason} rows={2} /></label>
    <p>This records a report, not a judgment about anyone. A finance check-in does not approve purchases, change a budget, or move money.</p><ReviewFooter busy={busy} error={error} />
  </form></PracticeDialog>
}

export function PracticeMealEditor({ type, meal, saved, onReview, onClose }) {
  const changed = Boolean(saved?.mealName && saved.mealName !== meal?.name)
  const [draft, setDraft] = useState(() => saved && !changed ? { ...saved } : blankMealReadiness(meal?.name || ''))
  const set = (field, value) => setDraft(previous => ({ ...previous, [field]: value }))
  const { busy, error, review } = useReview(onReview)
  const number = value => value === '' ? null : Number(value)
  return <PracticeDialog title={`${type[0].toUpperCase()}${type.slice(1)} coverage`} onClose={onClose}><form onSubmit={event => { event.preventDefault(); review(draft) }}>
    <p><strong>{meal?.name || 'No meal is available from Meal Plan.'}</strong> Recipes remain in Meal Plan. This record covers preparation, availability and actual use—not a duplicate recipe.</p>
    {changed && <p role="alert">The planned meal changed. Review new coverage; the earlier record remains in Audit History.</p>}
    <label className="practice-check"><input type="checkbox" checked={draft.notRequired} onChange={event => set('notRequired', event.target.checked)} />No household meal is needed for this slot</label>
    <div className="practice-form-grid"><Adult label="Preparation owner" value={draft.owner} onChange={value => set('owner', value)} /><Adult label="Meal backup" value={draft.backup} onChange={value => set('backup', value)} /><label><span>Ready by</span><input type="time" value={draft.readyBy} onChange={event => set('readyBy', event.target.value)} /></label><label><span>Expected portions</span><input type="number" min="0" max="30" step="1" value={draft.headcount ?? ''} onChange={event => set('headcount', number(event.target.value))} /></label></div>
    <fieldset><legend>Preparation and procurement</legend><label className="practice-check"><input type="checkbox" checked={draft.inventoryChecked} onChange={event => set('inventoryChecked', event.target.checked)} />Usable inventory checked before purchasing</label><label className="practice-check"><input type="checkbox" checked={draft.ingredientsReady} onChange={event => set('ingredientsReady', event.target.checked)} />Ingredients available / procurement covered</label>
      <label><span>Preparation status</span><select value={draft.preparation} onChange={event => set('preparation', event.target.value)}><option value="unrecorded">Not recorded</option><option value="planned">Planned; not yet prepared</option><option value="preparing">Preparation in progress</option><option value="ready">Meal is ready</option></select></label>
      <label><span>Serving or storage location</span><input value={draft.location} maxLength={200} onChange={event => set('location', event.target.value)} placeholder="For example: labeled portions in refrigerator" /></label>
      <label><span>Fallback meal and coverage</span><textarea value={draft.fallback} maxLength={600} onChange={event => set('fallback', event.target.value)} rows={2} /></label></fieldset>
    <label className="practice-check"><input type="checkbox" checked={draft.communicated} onChange={event => set('communicated', event.target.checked)} />Post that this meal is available at the location above in the shared Brevity plan</label><p>Saving publishes availability inside Brevity. It does not send a text, email or push notification.</p>
    <fieldset><legend>Actual use — optional until known</legend><label><span>Portions actually eaten</span><input type="number" min="0" max="30" step="1" value={draft.portionsEaten ?? ''} onChange={event => set('portionsEaten', number(event.target.value))} placeholder="Unknown" /></label><label><span>Leftover use, storage and cleanup responsibility</span><textarea value={draft.leftovers} maxLength={600} onChange={event => set('leftovers', event.target.value)} rows={2} /></label></fieldset>
    <label><span>Exception or reason the meal is not needed</span><textarea value={draft.exception} onChange={event => set('exception', event.target.value)} maxLength={600} required={draft.notRequired} rows={2} /></label>
    <ReviewFooter busy={busy} error={error} />
  </form></PracticeDialog>
}

export function PracticeWeeklyEditor({ notes = '', onReview, onClose }) {
  const [value, setValue] = useState(notes)
  const { busy, error, review } = useReview(onReview)
  return <PracticeDialog title="Record the weekly family review" onClose={onClose}><form onSubmit={event => { event.preventDefault(); review(value) }}><p>Review the practice and the workload—not a person's worth. Record what worked, obstacles, agreed recovery actions, owners and dates. Change standing policies separately through their agreement editor.</p><label><span>Wins, decisions and next steps</span><textarea value={value} onChange={event => setValue(event.target.value)} maxLength={2000} rows={8} required /></label><ReviewFooter busy={busy} error={error} /></form></PracticeDialog>
}
