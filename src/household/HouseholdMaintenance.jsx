import { useEffect, useMemo, useState } from 'react'
import {
  HOUSEHOLD_MAINTENANCE_STORAGE_KEY,
  buildHouseholdMaintenanceWeek,
  householdOccurrence,
  householdOperationZones,
  maintenanceDateKey,
  maintenanceWeekStart,
  normalizeHouseholdMaintenanceState,
  publishHouseholdOperationEvents,
  summarizeHouseholdMaintenance,
} from './householdMaintenanceData.js'
import { HOUSEHOLD_MEMBERS } from '../homehq/projectData.js'
import { SHARED_STATE_EVENT } from './sharedState.js'
import './HouseholdMaintenance.css'

function loadState() {
  try { return normalizeHouseholdMaintenanceState(JSON.parse(localStorage.getItem(HOUSEHOLD_MAINTENANCE_STORAGE_KEY) || '{}')) }
  catch { return normalizeHouseholdMaintenanceState() }
}
function addWeeks(date, amount) { const result = new Date(date); result.setDate(result.getDate() + (amount * 7)); return result }
function weekLabel(start) { const end = new Date(start); end.setDate(end.getDate() + 6); return `${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} - ${end.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}` }
function Stat({ label, value, tone = '' }) { return <div className={`maintenance-stat${tone ? ` maintenance-stat--${tone}` : ''}`}><span>{label}</span><strong>{value}</strong></div> }

export default function HouseholdMaintenance({ currentMember }) {
  const [weekStart, setWeekStart] = useState(() => maintenanceWeekStart(new Date()))
  const [state, setState] = useState(loadState)
  const [ownerFilter, setOwnerFilter] = useState('Mine')
  const [zoneFilter, setZoneFilter] = useState('All Zones')
  const todayKey = maintenanceDateKey(new Date())
  const days = useMemo(() => buildHouseholdMaintenanceWeek(weekStart), [weekStart])
  const summary = useMemo(() => summarizeHouseholdMaintenance(days, state), [days, state])
  const zones = useMemo(() => householdOperationZones(days), [days])
  const owners = ['Mine', 'All', ...HOUSEHOLD_MEMBERS, 'Everyone']

  useEffect(() => {
    const refresh = event => {
      if (event.type === 'storage' && event.key !== HOUSEHOLD_MAINTENANCE_STORAGE_KEY) return
      if (event.type === SHARED_STATE_EVENT && !event.detail?.keys?.includes(HOUSEHOLD_MAINTENANCE_STORAGE_KEY)) return
      setState(loadState())
    }
    window.addEventListener('storage', refresh)
    window.addEventListener(SHARED_STATE_EVENT, refresh)
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener(SHARED_STATE_EVENT, refresh) }
  }, [])

  useEffect(() => {
    if (!localStorage.getItem(HOUSEHOLD_MAINTENANCE_STORAGE_KEY)) localStorage.setItem(HOUSEHOLD_MAINTENANCE_STORAGE_KEY, JSON.stringify(state))
    publishHouseholdOperationEvents(localStorage, state)
  }, [])

  const persist = next => {
    const normalized = normalizeHouseholdMaintenanceState(next)
    setState(normalized)
    localStorage.setItem(HOUSEHOLD_MAINTENANCE_STORAGE_KEY, JSON.stringify(normalized))
    publishHouseholdOperationEvents(localStorage, normalized)
  }
  const patchOccurrence = (task, patch) => {
    const prior = householdOccurrence(state, task)
    const nextOccurrence = { ...prior, ...patch, updatedAt: new Date().toISOString(), updatedBy: currentMember }
    persist({ ...state, occurrences: { ...state.occurrences, [task.occurrenceId]: nextOccurrence } })
  }
  const toggleTask = task => {
    const prior = householdOccurrence(state, task)
    patchOccurrence(task, !prior.complete
      ? { complete: true, completedAt: new Date().toISOString(), completedBy: currentMember, exception: '' }
      : { complete: false, completedAt: '', completedBy: '' })
  }
  const updateCoverage = (task, coveredBy) => patchOccurrence(task, { coveredBy: coveredBy === 'Original owner' ? '' : coveredBy, coverageConfirmedBy: coveredBy && coveredBy !== 'Original owner' ? currentMember : '' })
  const reportException = task => {
    const prior = householdOccurrence(state, task)
    const message = window.prompt(`What is preventing “${task.title}” from being completed?`, prior.exception || '')
    if (message === null) return
    patchOccurrence(task, { exception: message.trim(), exceptionReportedBy: message.trim() ? currentMember : '' })
  }

  const ownerMatches = task => {
    const occurrence = householdOccurrence(state, task)
    if (ownerFilter === 'All') return true
    if (ownerFilter === 'Mine') return task.owners.includes('Everyone') || task.owners.includes(currentMember) || occurrence.coveredBy === currentMember
    if (ownerFilter === 'Everyone') return task.owners.includes('Everyone')
    return task.owners.includes(ownerFilter) || occurrence.coveredBy === ownerFilter
  }

  return <div className="household-maintenance household-operations">
    <header className="maintenance-hero">
      <div>
        <p className="maintenance-kicker">Household Management · Operations</p>
        <h1>Household Operations</h1>
        <p>Recurring responsibilities, day-specific ownership, coverage, standards, exceptions, and Family Calendar execution in one operating view.</p>
      </div>
      <div className="maintenance-week-controls">
        <button type="button" onClick={() => setWeekStart(addWeeks(weekStart, -1))} aria-label="Previous week"><i className="ti ti-chevron-left" /></button>
        <div><span>Operating week</span><strong>{weekLabel(weekStart)}</strong></div>
        <button type="button" onClick={() => setWeekStart(addWeeks(weekStart, 1))} aria-label="Next week"><i className="ti ti-chevron-right" /></button>
        <button className="maintenance-this-week" type="button" onClick={() => setWeekStart(maintenanceWeekStart(new Date()))}>This week</button>
      </div>
    </header>

    <section className="maintenance-summary" aria-label="Weekly household operations summary">
      <Stat label="Scheduled" value={summary.scheduled} />
      <Stat label="Completed" value={summary.completed} tone="complete" />
      <Stat label="Due today" value={summary.dueToday} tone="today" />
      <Stat label="Exceptions" value={summary.exceptions} tone={summary.exceptions ? 'overdue' : ''} />
      <Stat label="Overdue" value={summary.overdue} tone={summary.overdue ? 'overdue' : ''} />
    </section>

    <section className="maintenance-operating-rule operations-principles">
      <div><i className="ti ti-repeat" /><span><strong>Recurring standard</strong> Template repeats; daily status never changes the template.</span></div>
      <div><i className="ti ti-user-check" /><span><strong>Coverage</strong> Reassignment applies only to that date.</span></div>
      <div><i className="ti ti-alert-triangle" /><span><strong>Exception first</strong> Anything blocked is visible instead of silently missed.</span></div>
      <div><i className="ti ti-calendar-event" /><span><strong>Calendar connected</strong> Six rolling weeks publish to Family Calendar.</span></div>
    </section>

    <div className="maintenance-toolbar operations-toolbar">
      <div className="operations-filter-group"><span>Responsibility</span>{owners.map(owner => <button type="button" className={ownerFilter === owner ? 'active' : ''} onClick={() => setOwnerFilter(owner)} key={owner}>{owner === 'Mine' ? 'My responsibilities' : owner}</button>)}</div>
      <div className="operations-filter-group"><span>Zone</span>{zones.map(zone => <button type="button" className={zoneFilter === zone ? 'active' : ''} onClick={() => setZoneFilter(zone)} key={zone}>{zone}</button>)}</div>
      <small>Completion, coverage, and exceptions are saved for the specific calendar date and synchronized across Brevity devices.</small>
    </div>

    <div className="maintenance-days">
      {days.map(day => {
        const visibleTasks = day.tasks.filter(task => ownerMatches(task) && (zoneFilter === 'All Zones' || task.zone === zoneFilter))
        const isToday = day.date === todayKey
        return <section className={`maintenance-day${isToday ? ' is-today' : ''}`} key={day.date}>
          <header><div><span>{isToday ? 'Today' : 'Daily plan'}</span><h2>{day.label}</h2></div><strong>{visibleTasks.length} responsibility{visibleTasks.length === 1 ? '' : 'ies'}</strong></header>
          <div className="maintenance-task-list">
            {!visibleTasks.length && <p className="maintenance-empty">No responsibilities match this view.</p>}
            {visibleTasks.map(task => {
              const occurrence = householdOccurrence(state, task)
              const isComplete = Boolean(occurrence.complete)
              const isOverdue = day.date >= state.trackingStartedOn && day.date < todayKey && !isComplete
              const effectiveOwner = occurrence.coveredBy || (task.owners.includes('Everyone') ? 'Everyone' : task.owners.join(' + '))
              return <article className={`maintenance-task${isComplete ? ' is-complete' : ''}${isOverdue ? ' is-overdue' : ''}${occurrence.exception ? ' has-exception' : ''}`} key={task.occurrenceId}>
                <button className="maintenance-check" type="button" onClick={() => toggleTask(task)} aria-label={`${isComplete ? 'Reopen' : 'Complete'} ${task.title}`} aria-pressed={isComplete}><i className={`ti ${isComplete ? 'ti-check' : 'ti-circle'}`} /></button>
                <div className="maintenance-task-body">
                  <div className="maintenance-task-heading"><div><span>{task.zone} · {task.category}</span><h3>{task.title}</h3></div><time>{task.timing}</time></div>
                  <div className="maintenance-owners"><span><i className="ti ti-user" /> {effectiveOwner}</span><span><i className="ti ti-shield-check" /> Standard: {task.standard}</span></div>
                  <div className="operations-actions">
                    <label><span>Coverage</span><select value={occurrence.coveredBy || 'Original owner'} onChange={event => updateCoverage(task, event.target.value)}><option>Original owner</option>{HOUSEHOLD_MEMBERS.map(member => <option key={member}>{member}</option>)}</select></label>
                    <button type="button" className={occurrence.exception ? 'is-active' : ''} onClick={() => reportException(task)}><i className="ti ti-alert-triangle" /> {occurrence.exception ? 'Edit exception' : 'Report exception'}</button>
                  </div>
                  {occurrence.exception && <div className="operations-exception"><strong>Exception</strong><span>{occurrence.exception}</span><small>Reported by {occurrence.exceptionReportedBy || occurrence.updatedBy || 'Household'}</small></div>}
                  <details><summary>Completion standard & checklist</summary><ul>{task.details.map(detail => <li key={detail}>{detail}</li>)}</ul></details>
                  {isComplete && <small className="maintenance-completed-by">Completed by {occurrence.completedBy || 'Household'}{occurrence.completedAt ? ` at ${new Date(occurrence.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}</small>}
                  {isOverdue && <small className="maintenance-overdue-label">Overdue — complete it, assign coverage, or report the exception.</small>}
                </div>
              </article>
            })}
          </div>
        </section>
      })}
    </div>
  </div>
}
