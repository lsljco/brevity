import { useEffect, useMemo, useState } from 'react'
import {
  HOUSEHOLD_CHORE_VERIFIERS,
  HOUSEHOLD_MAINTENANCE_STORAGE_KEY,
  HOUSEHOLD_OPERATING_PRINCIPLE,
  HOUSEHOLD_OPERATING_STANDARDS,
  buildHouseholdMaintenanceWeek,
  householdOccurrence,
  householdOperationZones,
  maintenanceDateKey,
  maintenanceWeekStart,
  normalizeHouseholdMaintenanceState,
  occurrenceStatus,
  publishHouseholdOperationEvents,
  summarizeHouseholdMaintenance,
} from './householdMaintenanceData.js'
import { HOUSEHOLD_MEMBERS } from '../homehq/projectData.js'
import { SHARED_STATE_EVENT } from './sharedState.js'
import HouseholdInventory from './HouseholdInventory.jsx'
import HouseholdIntelligencePanel from './HouseholdIntelligencePanel.jsx'
import HouseholdSchedule from './HouseholdSchedule.jsx'
import './HouseholdMaintenance.css'
import './HouseholdOperationsTabs.css'

function loadState() {
  try { return normalizeHouseholdMaintenanceState(JSON.parse(localStorage.getItem(HOUSEHOLD_MAINTENANCE_STORAGE_KEY) || '{}')) }
  catch { return normalizeHouseholdMaintenanceState() }
}
function addWeeks(date, amount) { const result = new Date(date); result.setDate(result.getDate() + (amount * 7)); return result }
function weekLabel(start) { const end = new Date(start); end.setDate(end.getDate() + 6); return `${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} - ${end.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}` }
function Stat({ label, value, tone = '' }) { return <div className={`maintenance-stat${tone ? ` maintenance-stat--${tone}` : ''}`}><span>{label}</span><strong>{value}</strong></div> }
function OperationsTabs({ workspace, setWorkspace }) {
  return <nav className="household-operations-tabs" aria-label="Household operating areas">
    <button type="button" className={workspace==='schedule'?'active':''} onClick={()=>setWorkspace('schedule')}>Schedule</button>
    <button type="button" className={workspace==='routines'?'active':''} onClick={()=>setWorkspace('routines')}>Routines</button>
    <button type="button" className={workspace==='operations'?'active':''} onClick={()=>setWorkspace('operations')}>Operations</button>
    <button type="button" className={workspace==='inventory'?'active':''} onClick={()=>setWorkspace('inventory')}>Supplies & Inventory</button>
  </nav>
}

export default function HouseholdMaintenance({ currentMember }) {
  const [workspace, setWorkspace] = useState('schedule')
  const [weekStart, setWeekStart] = useState(() => maintenanceWeekStart(new Date()))
  const [state, setState] = useState(loadState)
  const [ownerFilter, setOwnerFilter] = useState('Mine')
  const [zoneFilter, setZoneFilter] = useState('All Zones')
  const todayKey = maintenanceDateKey(new Date())
  const days = useMemo(() => buildHouseholdMaintenanceWeek(weekStart), [weekStart])
  const summary = useMemo(() => summarizeHouseholdMaintenance(days, state), [days, state])
  const zones = useMemo(() => householdOperationZones(days), [days])
  const owners = ['Mine', 'All', ...HOUSEHOLD_MEMBERS, 'Everyone']
  const isVerifier = HOUSEHOLD_CHORE_VERIFIERS.includes(currentMember)
  const awaitingApproval = useMemo(() => days.flatMap(day => day.tasks.map(task => ({ day, task, occurrence: householdOccurrence(state,task) }))).filter(item => item.occurrence.submittedAt && !item.occurrence.approvedAt && !item.occurrence.returnedAt), [days,state])

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
  const patchOccurrence = (task, patch, action = 'updated') => {
    const prior = householdOccurrence(state, task)
    const now = new Date().toISOString()
    const history = [...(Array.isArray(prior.history) ? prior.history : []), { action, by:currentMember, at:now, note:patch.returnReason || patch.exception || '' }]
    const nextOccurrence = { ...prior, ...patch, history, updatedAt: now, updatedBy: currentMember }
    persist({ ...state, occurrences: { ...state.occurrences, [task.occurrenceId]: nextOccurrence } })
  }
  const submitTask = task => {
    const prior = householdOccurrence(state, task)
    if (prior.approvedAt) return
    if (prior.submittedAt && !prior.returnedAt) return
    const now = new Date().toISOString()
    patchOccurrence(task, {
      complete: !task.signoffRequired,
      completedAt: now,
      completedBy: currentMember,
      submittedAt: task.signoffRequired ? now : '',
      submittedBy: task.signoffRequired ? currentMember : '',
      approvedAt:'', approvedBy:'', returnedAt:'', returnedBy:'', returnReason:'', exception:'',
    }, task.signoffRequired ? 'submitted-for-signoff' : 'completed')
  }
  const approveTask = task => {
    if (!isVerifier) return
    const now = new Date().toISOString()
    patchOccurrence(task, { complete:true, approvedAt:now, approvedBy:currentMember, returnedAt:'', returnedBy:'', returnReason:'' }, 'approved')
  }
  const returnTask = task => {
    if (!isVerifier) return
    const occurrence = householdOccurrence(state,task)
    const reason = window.prompt(`Why is “${task.title}” being returned?`, occurrence.returnReason || '')
    if (reason === null || !reason.trim()) return
    patchOccurrence(task, { complete:false, submittedAt:'', submittedBy:'', approvedAt:'', approvedBy:'', returnedAt:new Date().toISOString(), returnedBy:currentMember, returnReason:reason.trim() }, 'returned')
  }
  const reopenTask = task => {
    if (!isVerifier) return
    patchOccurrence(task, { complete:false, completedAt:'', completedBy:'', submittedAt:'', submittedBy:'', approvedAt:'', approvedBy:'', returnedAt:'', returnedBy:'', returnReason:'' }, 'reopened')
  }
  const updateCoverage = (task, coveredBy) => patchOccurrence(task, { coveredBy: coveredBy === 'Original owner' ? '' : coveredBy, coverageConfirmedBy: coveredBy && coveredBy !== 'Original owner' ? currentMember : '' }, 'coverage-updated')
  const reportException = task => {
    const prior = householdOccurrence(state, task)
    const message = window.prompt(`What is preventing “${task.title}” from being completed?`, prior.exception || '')
    if (message === null) return
    patchOccurrence(task, { exception: message.trim(), exceptionReportedBy: message.trim() ? currentMember : '' }, message.trim() ? 'exception-reported' : 'exception-cleared')
  }

  const ownerMatches = task => {
    const occurrence = householdOccurrence(state, task)
    if (ownerFilter === 'All') return true
    if (ownerFilter === 'Mine') return task.owners.includes('Everyone') || task.owners.includes(currentMember) || occurrence.coveredBy === currentMember
    if (ownerFilter === 'Everyone') return task.owners.includes('Everyone')
    return task.owners.includes(ownerFilter) || occurrence.coveredBy === ownerFilter
  }

  if (workspace === 'schedule') return <div className="household-operations-shell"><OperationsTabs workspace={workspace} setWorkspace={setWorkspace}/><HouseholdSchedule currentMember={currentMember} mode="schedule"/></div>
  if (workspace === 'routines') return <div className="household-operations-shell"><OperationsTabs workspace={workspace} setWorkspace={setWorkspace}/><HouseholdSchedule currentMember={currentMember} mode="routines"/></div>
  if (workspace === 'inventory') return <div className="household-operations-shell"><OperationsTabs workspace={workspace} setWorkspace={setWorkspace}/><HouseholdInventory currentMember={currentMember}/></div>

  return <div className="household-maintenance household-operations">
    <OperationsTabs workspace={workspace} setWorkspace={setWorkspace}/>
    <HouseholdIntelligencePanel currentMember={currentMember} />
    <header className="maintenance-hero">
      <div>
        <p className="maintenance-kicker">Household Management · Operations</p>
        <h1>Household Cleaning Plan</h1>
        <p>{HOUSEHOLD_OPERATING_PRINCIPLE}</p>
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
      <Stat label="Approved" value={summary.approved} tone="complete" />
      <Stat label="Awaiting sign-off" value={summary.awaitingSignoff} tone={summary.awaitingSignoff ? 'today' : ''} />
      <Stat label="Due today" value={summary.dueToday} tone="today" />
      <Stat label="Exceptions" value={summary.exceptions} tone={summary.exceptions ? 'overdue' : ''} />
      <Stat label="Overdue" value={summary.overdue} tone={summary.overdue ? 'overdue' : ''} />
    </section>

    {isVerifier && awaitingApproval.length > 0 && <section className="operations-signoff-queue"><header><div><p>Verification queue</p><h2>{awaitingApproval.length} chore{awaitingApproval.length===1?'':'s'} awaiting your sign-off</h2></div><span>Either Larry or Terica may approve.</span></header>{awaitingApproval.map(({day,task,occurrence})=><article key={task.occurrenceId}><div><strong>{task.title}</strong><span>{day.label} · {task.zone} · submitted by {occurrence.submittedBy || occurrence.completedBy}</span></div><div><button className="approve" onClick={()=>approveTask(task)}>Approve</button><button onClick={()=>returnTask(task)}>Return</button></div></article>)}</section>}

    <section className="maintenance-operating-rule operations-principles">
      <div><i className="ti ti-clock" /><span><strong>Nyla · 2–4 PM</strong> Primary weekday operator: assigned zone and completion before evening.</span></div>
      <div><i className="ti ti-moon" /><span><strong>Javin · After work</strong> 20–30 minute closeout: floors, finishing work, or the assigned support task.</span></div>
      <div><i className="ti ti-calendar-week" /><span><strong>Saturday · Rotation</strong> Light reset plus one heavier maintenance item only when it is actually needed.</span></div>
      <div><i className="ti ti-home-check" /><span><strong>Sunday · Joint reset</strong> 60–90 minutes together to restore a clean, organized Monday baseline.</span></div>
    </section>

    <section className="maintenance-operating-rule operations-principles" aria-label="Household cleaning standards">
      {HOUSEHOLD_OPERATING_STANDARDS.map(item => <div key={item.title}><i className="ti ti-shield-check" /><span><strong>{item.title}</strong> {item.detail}</span></div>)}
    </section>

    <div className="maintenance-toolbar operations-toolbar">
      <div className="operations-filter-group"><span>Responsibility</span>{owners.map(owner => <button type="button" className={ownerFilter === owner ? 'active' : ''} onClick={() => setOwnerFilter(owner)} key={owner}>{owner === 'Mine' ? 'My responsibilities' : owner}</button>)}</div>
      <div className="operations-filter-group"><span>Zone</span>{zones.map(zone => <button type="button" className={zoneFilter === zone ? 'active' : ''} onClick={() => setZoneFilter(zone)} key={zone}>{zone}</button>)}</div>
      <small>Scheduled chores are not closed when submitted. They remain awaiting verification until Larry or Terica signs off.</small>
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
              const status = occurrenceStatus(task,occurrence)
              const isApproved = status === 'Approved' || status === 'Complete'
              const isAwaiting = status === 'Awaiting sign-off'
              const isReturned = status === 'Returned'
              const isOverdue = day.date >= state.trackingStartedOn && day.date < todayKey && !isApproved
              const effectiveOwner = occurrence.coveredBy || (task.owners.includes('Everyone') ? 'Everyone' : task.owners.join(' + '))
              const canSubmit = task.owners.includes(currentMember) || task.owners.includes('Everyone') || occurrence.coveredBy === currentMember
              return <article className={`maintenance-task${isApproved ? ' is-complete' : ''}${isAwaiting ? ' is-awaiting' : ''}${isReturned ? ' is-returned' : ''}${isOverdue ? ' is-overdue' : ''}${occurrence.exception ? ' has-exception' : ''}`} key={task.occurrenceId}>
                <button className="maintenance-check" type="button" disabled={!canSubmit || isAwaiting || isApproved} onClick={() => submitTask(task)} aria-label={`Submit ${task.title} for completion`}><i className={`ti ${isApproved?'ti-check':isAwaiting?'ti-clock-check':isReturned?'ti-rotate-clockwise':'ti-circle'}`} /></button>
                <div className="maintenance-task-body">
                  <div className="maintenance-task-heading"><div><span>{task.zone} · {task.category}</span><h3>{task.title}</h3></div><time>{task.timing}</time></div>
                  <div className="maintenance-owners"><span><i className="ti ti-user" /> {effectiveOwner}</span><span><i className="ti ti-shield-check" /> Sign-off: {(task.verifiers || HOUSEHOLD_CHORE_VERIFIERS).join(' or ')}</span></div>
                  <div className={`operations-status operations-status--${status.toLowerCase().replace(/\s+/g,'-')}`}><strong>{status}</strong>{isAwaiting&&<span>Submitted by {occurrence.submittedBy || occurrence.completedBy}. Waiting for verification.</span>}{isApproved&&<span>Approved by {occurrence.approvedBy || 'Verifier'}.</span>}{isReturned&&<span>Returned by {occurrence.returnedBy}: {occurrence.returnReason}</span>}</div>
                  <div className="operations-actions">
                    <label><span>Coverage</span><select value={occurrence.coveredBy || 'Original owner'} onChange={event => updateCoverage(task, event.target.value)}><option>Original owner</option>{HOUSEHOLD_MEMBERS.map(member => <option key={member}>{member}</option>)}</select></label>
                    {canSubmit && !isAwaiting && !isApproved && <button type="button" onClick={()=>submitTask(task)}><i className="ti ti-send" /> {isReturned?'Resubmit for sign-off':'Mark complete & submit'}</button>}
                    {isVerifier && isAwaiting && <><button className="is-approve" type="button" onClick={()=>approveTask(task)}><i className="ti ti-check" /> Approve</button><button type="button" onClick={()=>returnTask(task)}><i className="ti ti-arrow-back-up" /> Return</button></>}
                    {isVerifier && isApproved && <button type="button" onClick={()=>reopenTask(task)}><i className="ti ti-lock-open" /> Reopen</button>}
                    <button type="button" className={occurrence.exception ? 'is-active' : ''} onClick={() => reportException(task)}><i className="ti ti-alert-triangle" /> {occurrence.exception ? 'Edit exception' : 'Report exception'}</button>
                  </div>
                  {occurrence.exception && <div className="operations-exception"><strong>Exception</strong><span>{occurrence.exception}</span><small>Reported by {occurrence.exceptionReportedBy || occurrence.updatedBy || 'Household'}</small></div>}
                  <details><summary>Completion standard & checklist</summary><ul>{task.details.map(detail => <li key={detail}>{detail}</li>)}</ul></details>
                  {occurrence.completedAt && <small className="maintenance-completed-by">Submitted by {occurrence.completedBy || 'Household'} at {new Date(occurrence.completedAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}{occurrence.approvedAt?` · signed off by ${occurrence.approvedBy}`:''}</small>}
                  {isOverdue && <small className="maintenance-overdue-label">Overdue — complete it, assign coverage, report an exception, or finish sign-off.</small>}
                </div>
              </article>
            })}
          </div>
        </section>
      })}
    </div>
  </div>
}
