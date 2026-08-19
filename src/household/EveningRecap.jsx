import { useState } from 'react'
import { normalizeDailyPlan } from './dailyPlan.js'

const splitLines = value => String(value || '').split('\n').map(item => item.trim()).filter(Boolean)
const joinLines = value => Array.isArray(value) ? value.join('\n') : ''

export default function EveningRecap({ plan, onCancel, onComplete }) {
  const normalized = normalizeDailyPlan(plan)
  const [draft, setDraft] = useState(normalized.recap)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const update = patch => setDraft(current => ({ ...current, ...patch }))

  const finish = async () => {
    setSaving(true); setError('')
    try {
      await onComplete({ ...normalized, recap: { ...draft, completedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() })
    } catch (err) {
      setError(err.message || 'Could not save the household recap.')
      setSaving(false)
    }
  }

  return <div className="evening-recap">
    <header className="morning-alignment-header"><div><span>Close the Loop</span><h1>Evening Recap</h1><p>Measure the day, carry forward only what matters, and prepare tomorrow before bed.</p></div><button type="button" onClick={onCancel}>Exit</button></header>
    <section className="alignment-workspace">
      <div className="alignment-form-grid alignment-form-grid--two">
        <label className="alignment-field"><span>Wins / completed outcomes</span><textarea value={joinLines(draft.wins)} onChange={event => update({ wins: splitLines(event.target.value) })} placeholder="One win per line" /></label>
        <label className="alignment-field"><span>Carryovers</span><textarea value={joinLines(draft.carryovers)} onChange={event => update({ carryovers: splitLines(event.target.value) })} placeholder="Only items that still matter tomorrow" /></label>
        <label className="alignment-field"><span>Lessons / feedback</span><textarea value={joinLines(draft.lessons)} onChange={event => update({ lessons: splitLines(event.target.value) })} placeholder="What worked? What produced friction?" /></label>
        <label className="alignment-field"><span>Tomorrow preparation</span><textarea value={joinLines(draft.tomorrowPrep)} onChange={event => update({ tomorrowPrep: splitLines(event.target.value) })} placeholder="Meals, clothing, school, appointments, funding, ministry…" /></label>
      </div>
    </section>
    {error && <div className="alignment-error">{error}</div>}
    <footer className="alignment-footer"><button type="button" className="alignment-secondary" onClick={onCancel}>Cancel</button><div /><button type="button" className="alignment-primary" disabled={saving} onClick={finish}>{saving ? 'Saving…' : 'Close Today'}</button></footer>
  </div>
}
