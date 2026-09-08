import { useEffect, useRef, useState } from 'react'
import { normalizeDailyPlan } from './dailyPlan.js'
import { loadLocalRecapDraft, saveLocalRecapDraft } from './dailyPlanLocalDraft.js'
import { compactEditableLines, joinEditableLines, splitEditableLines } from './lineEditing.js'

const splitLines = splitEditableLines
const joinLines = joinEditableLines

export default function EveningRecap({ plan, readOnly = false, readOnlyMessage = '', onCancel, onComplete }) {
  const normalized = normalizeDailyPlan(plan)
  const openedVersionRef = useRef(Number(plan?.version || 0))
  const [draft, setDraft] = useState(() => loadLocalRecapDraft(globalThis.localStorage, normalized, openedVersionRef.current))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const update = patch => {
    if (readOnly) return
    setDraft(current => ({ ...current, ...patch }))
  }

  useEffect(() => {
    if (readOnly) return undefined
    const snapshot = draft
    const timer = setTimeout(() => {
      try { saveLocalRecapDraft(globalThis.localStorage, normalized, snapshot, openedVersionRef.current) }
      catch { /* The in-memory draft remains available for retry. */ }
    }, 500)
    return () => clearTimeout(timer)
  }, [draft, normalized.date, readOnly])

  const finish = async () => {
    if (readOnly) { onCancel(); return }
    setSaving(true); setError('')
    try {
      const cleanedDraft = {
        ...draft,
        wins: compactEditableLines(draft.wins),
        carryovers: compactEditableLines(draft.carryovers),
        lessons: compactEditableLines(draft.lessons),
        tomorrowPrep: compactEditableLines(draft.tomorrowPrep),
      }
      saveLocalRecapDraft(globalThis.localStorage, normalized, cleanedDraft, openedVersionRef.current)
      await onComplete(cleanedDraft, { expectedVersion:openedVersionRef.current, completedAt:new Date().toISOString() })
      setSaving(false)
    } catch (err) {
      setError(err.message || 'Could not save the household recap.')
      setSaving(false)
    }
  }

  return <div className="evening-recap">
    <header className="morning-alignment-header"><div><span>Close the Loop</span><h1>Evening Recap</h1><p>Measure the day, carry forward only what matters, and prepare tomorrow before bed.</p></div><button type="button" onClick={onCancel}>Return to Today</button></header>
    {readOnly && <div className="alignment-read-only-notice" role="status"><i className="ti ti-lock" aria-hidden="true"/><div><strong>This recap is view-only</strong><span>{readOnlyMessage || 'Plans & decisions permission is required to close or change the shared daily plan.'}</span></div></div>}
    <section className="alignment-workspace">
      <div className="alignment-form-grid alignment-form-grid--two">
        <label className="alignment-field"><span>Wins / completed outcomes</span><textarea readOnly={readOnly} value={joinLines(draft.wins)} onChange={event => update({ wins: splitLines(event.target.value) })} placeholder="One win per line" /></label>
        <label className="alignment-field"><span>Carryovers</span><textarea readOnly={readOnly} value={joinLines(draft.carryovers)} onChange={event => update({ carryovers: splitLines(event.target.value) })} placeholder="Only items that still matter tomorrow" /></label>
        <label className="alignment-field"><span>Lessons / feedback</span><textarea readOnly={readOnly} value={joinLines(draft.lessons)} onChange={event => update({ lessons: splitLines(event.target.value) })} placeholder="What worked? What produced friction?" /></label>
        <label className="alignment-field"><span>Tomorrow preparation</span><textarea readOnly={readOnly} value={joinLines(draft.tomorrowPrep)} onChange={event => update({ tomorrowPrep: splitLines(event.target.value) })} placeholder="Meals, clothing, school, appointments, funding, ministry…" /></label>
      </div>
    </section>
    {error && <div className="alignment-error">{error}</div>}
    <footer className="alignment-footer"><button type="button" className="alignment-secondary" onClick={onCancel}>{readOnly ? 'Previous Screen' : 'Cancel'}</button><div />{readOnly ? <button type="button" className="alignment-primary" onClick={onCancel}>Return to Today</button> : <button type="button" className="alignment-primary" disabled={saving} onClick={finish}>{saving ? 'Opening review…' : 'Review & Close Today'}</button>}</footer>
  </div>
}
