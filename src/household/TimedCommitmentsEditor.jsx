import { HOUSEHOLD_MEMBERS, createPlanItem } from './dailyPlan.js'
import './TimedCommitmentsEditor.css'

const makeCommitment = (planDate, prefix) => createPlanItem({
  id: `${prefix}-${crypto.randomUUID()}`,
  date: planDate,
  owner: 'Family',
  calendarSync: true,
})

export default function TimedCommitmentsEditor({ items = [], planDate, prefix = 'commitment', onChange }) {
  const updateItem = (id, patch) => onChange(items.map(item => item.id === id ? { ...item, ...patch } : item))
  const removeItem = id => onChange(items.filter(item => item.id !== id))
  const addItem = () => onChange([...items, makeCommitment(planDate, prefix)])

  return <div className="timed-commitments-editor">
    {items.map(item => <div className="timed-commitment-row" key={item.id}>
      <input className="timed-title" value={item.title || ''} onChange={event => updateItem(item.id, { title: event.target.value })} placeholder="Appointment or meeting" aria-label="Commitment title" />
      <input type="date" value={item.date || planDate} onChange={event => updateItem(item.id, { date: event.target.value })} aria-label="Date" />
      <input type="time" value={item.startTime || ''} onChange={event => updateItem(item.id, { startTime: event.target.value })} aria-label="Start time" />
      <select value={item.owner || 'Family'} onChange={event => updateItem(item.id, { owner: event.target.value })} aria-label="Owner">
        <option>Family</option>
        {HOUSEHOLD_MEMBERS.map(member => <option key={member}>{member}</option>)}
      </select>
      <label className="timed-calendar-toggle">
        <input type="checkbox" checked={Boolean(item.calendarSync)} onChange={event => updateItem(item.id, { calendarSync: event.target.checked })} />
        <span>Calendar</span>
      </label>
      <button type="button" className="timed-remove" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.title || 'commitment'}`}><i className="ti ti-x" /></button>
    </div>)}
    <button type="button" className="timed-add" onClick={addItem}><i className="ti ti-plus" /> Add timed commitment</button>
  </div>
}
