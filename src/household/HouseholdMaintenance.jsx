import { useEffect, useMemo, useState } from 'react'
import {
  HOUSEHOLD_MAINTENANCE_STORAGE_KEY,
  buildHouseholdMaintenanceWeek,
  maintenanceDateKey,
  maintenanceWeekStart,
  normalizeHouseholdMaintenanceState,
  summarizeHouseholdMaintenance,
} from './householdMaintenanceData.js'
import { SHARED_STATE_EVENT } from './sharedState.js'
import './HouseholdMaintenance.css'

function loadState() {
  try { return normalizeHouseholdMaintenanceState(JSON.parse(localStorage.getItem(HOUSEHOLD_MAINTENANCE_STORAGE_KEY) || '{}')) }
  catch { return normalizeHouseholdMaintenanceState() }
}

function addWeeks(date, amount) {
  const result = new Date(date)
  result.setDate(result.getDate() + (amount * 7))
  return result
}

function weekLabel(start) {
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startLabel} - ${endLabel}`
}

function Stat({ label, value, tone = '' }) {
  return <div className={`maintenance-stat${tone ? ` maintenance-stat--${tone}` : ''}`}><span>{label}</span><strong>{value}</strong></div>
}

export default function HouseholdMaintenance({ currentMember }) {
  const [weekStart, setWeekStart] = useState(() => maintenanceWeekStart(new Date()))
  const [state, setState] = useState(loadState)
  const [ownerFilter, setOwnerFilter] = useState('All')
  const todayKey = maintenanceDateKey(new Date())
  const days = useMemo(() => buildHouseholdMaintenanceWeek(weekStart), [weekStart])
  const summary = useMemo(() => summarizeHouseholdMaintenance(days, state), [days, state])
  const owners = ['All', 'Javin', 'Nyla', 'Isaiah', 'Everyone']

  useEffect(() => {
    const refresh = event => {
      if (event.type === 'storage' && event.key !== HOUSEHOLD_MAINTENANCE_STORAGE_KEY) return
      if (event.type === SHARED_STATE_EVENT && !event.detail?.keys?.includes(HOUSEHOLD_MAINTENANCE_STORAGE_KEY)) return
      setState(loadState())
    }
    window.addEventListener('storage', refresh)
    window.addEventListener(SHARED_STATE_EVENT, refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(SHARED_STATE_EVENT, refresh)
    }
  }, [])

  useEffect(() => {
    if (!localStorage.getItem(HOUSEHOLD_MAINTENANCE_STORAGE_KEY)) {
      localStorage.setItem(HOUSEHOLD_MAINTENANCE_STORAGE_KEY, JSON.stringify(state))
    }
  }, [state])

  const persist = next => {
    setState(next)
    localStorage.setItem(HOUSEHOLD_MAINTENANCE_STORAGE_KEY, JSON.stringify(next))
  }

  const toggleTask = task => {
    const prior = state.completions[task.occurrenceId]
    const complete = !prior?.complete
    persist({
      ...state,
      completions: {
        ...state.completions,
        [task.occurrenceId]: complete
          ? { complete: true, completedAt: new Date().toISOString(), completedBy: currentMember }
          : { complete: false },
      },
    })
  }

  return <div className="household-maintenance">
    <header className="maintenance-hero">
      <div>
        <p className="maintenance-kicker">Household Management</p>
        <h1>Household Maintenance</h1>
        <p>One complete floor at a time, with clear ownership and daily resets that protect the work.</p>
      </div>
      <div className="maintenance-week-controls">
        <button type="button" onClick={() => setWeekStart(addWeeks(weekStart, -1))} aria-label="Previous week"><i className="ti ti-chevron-left" /></button>
        <div><span>Operating week</span><strong>{weekLabel(weekStart)}</strong></div>
        <button type="button" onClick={() => setWeekStart(addWeeks(weekStart, 1))} aria-label="Next week"><i className="ti ti-chevron-right" /></button>
        <button className="maintenance-this-week" type="button" onClick={() => setWeekStart(maintenanceWeekStart(new Date()))}>This week</button>
      </div>
    </header>

    <section className="maintenance-summary" aria-label="Weekly maintenance summary">
      <Stat label="Scheduled" value={summary.scheduled} />
      <Stat label="Completed" value={summary.completed} tone="complete" />
      <Stat label="Due today" value={summary.dueToday} tone="today" />
      <Stat label="Overdue" value={summary.overdue} tone={summary.overdue ? 'overdue' : ''} />
    </section>

    <section className="maintenance-operating-rule">
      <div><i className="ti ti-clock-hour-4" /><span><strong>Floor block</strong> Wednesday-Friday, 12-4 PM</span></div>
      <div><i className="ti ti-users" /><span><strong>Core team</strong> Javin + Nyla</span></div>
      <div><i className="ti ti-user-plus" /><span><strong>Support after 2 PM</strong> Isaiah</span></div>
      <div><i className="ti ti-shield-check" /><span><strong>Completion standard</strong> 3-hour target; 4-hour hard stop</span></div>
    </section>

    <div className="maintenance-toolbar">
      <div><span>Filter by owner</span>{owners.map(owner => <button type="button" className={ownerFilter === owner ? 'active' : ''} onClick={() => setOwnerFilter(owner)} key={owner}>{owner}</button>)}</div>
      <small>Marking a task complete records who closed it and synchronizes the result across Brevity devices.</small>
    </div>

    <div className="maintenance-days">
      {days.map(day => {
        const visibleTasks = day.tasks.filter(task => ownerFilter === 'All' || task.owners.includes(ownerFilter))
        const isToday = day.date === todayKey
        return <section className={`maintenance-day${isToday ? ' is-today' : ''}`} key={day.date}>
          <header><div><span>{isToday ? 'Today' : 'Daily plan'}</span><h2>{day.label}</h2></div><strong>{visibleTasks.length} task{visibleTasks.length === 1 ? '' : 's'}</strong></header>
          <div className="maintenance-task-list">
            {!visibleTasks.length && <p className="maintenance-empty">No assignments for this owner.</p>}
            {visibleTasks.map(task => {
              const completion = state.completions[task.occurrenceId]
              const isComplete = Boolean(completion?.complete)
              const isOverdue = day.date >= state.trackingStartedOn && day.date < todayKey && !isComplete
              return <article className={`maintenance-task${isComplete ? ' is-complete' : ''}${isOverdue ? ' is-overdue' : ''}`} key={task.occurrenceId}>
                <button className="maintenance-check" type="button" onClick={() => toggleTask(task)} aria-label={`${isComplete ? 'Reopen' : 'Complete'} ${task.title}`} aria-pressed={isComplete}><i className={`ti ${isComplete ? 'ti-check' : 'ti-circle'}`} /></button>
                <div className="maintenance-task-body">
                  <div className="maintenance-task-heading"><div><span>{task.category}</span><h3>{task.title}</h3></div><time>{task.timing}</time></div>
                  <div className="maintenance-owners">{task.owners.map(owner => <span key={owner}><i className="ti ti-user" /> {owner}</span>)}</div>
                  <details><summary>Completion checklist</summary><ul>{task.details.map(detail => <li key={detail}>{detail}</li>)}</ul></details>
                  {isComplete && <small className="maintenance-completed-by">Completed by {completion.completedBy || 'Household'}{completion.completedAt ? ` at ${new Date(completion.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}</small>}
                  {isOverdue && <small className="maintenance-overdue-label">Overdue - complete or reopen the assignment</small>}
                </div>
              </article>
            })}
          </div>
        </section>
      })}
    </div>
  </div>
}
