import { useMemo, useState } from 'react'
import { mutateEstateMaintenance } from './estateApi.js'
import { nextMaintenanceStatus } from './estateMaintenance.js'
import { syncEstateMaintenanceToFamilyCalendar } from './estateMaintenanceCalendar.js'

const MEMBERS = ['Larry', 'Lorenzo', 'Terica', 'Nyla', 'Javin', 'Isaiah']
const STATUS_LABELS = { due: 'Due', scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cost_recorded: 'Cost recorded' }
const ACTION_LABELS = { scheduled: 'Schedule service', in_progress: 'Start work', completed: 'Mark complete', cost_recorded: 'Record cost & generate next' }

function todayKey() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const initialForm = () => ({ title: '', systemId: '', assetId: '', preferredVendorId: '', responsibleMember: 'Larry', nextDueDate: todayKey(), interval: 3, unit: 'months', expectedCost: '', priority: 'medium', instructions: '', calendarSyncEnabled: true })

export default function EstateMaintenance({ role, workspace, onWorkspaceChange }) {
  const [form, setForm] = useState(initialForm)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [costs, setCosts] = useState({})
  const plans = workspace.maintenancePlans || []
  const activeEvents = useMemo(() => (workspace.maintenanceEvents || [])
    .filter(event => event.status !== 'cost_recorded')
    .sort((a, b) => String(a.scheduledFor).localeCompare(String(b.scheduledFor))), [workspace.maintenanceEvents])
  const recordsForEvent = event => ({
    event,
    plan: plans.find(plan => plan.id === event.maintenancePlanId),
    workOrder: workspace.workOrders.find(workOrder => workOrder.id === event.workOrderId),
    propertyName: workspace.property.name,
  })
  const updateForm = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const createPlan = async event => {
    event.preventDefault()
    setBusy('create'); setError(''); setNotice('')
    try {
      const result = await mutateEstateMaintenance({
        propertyId: workspace.propertyId,
        action: 'create-plan',
        expectedVersion: workspace.version,
        plan: {
          title: form.title,
          systemId: form.systemId,
          assetId: form.assetId || null,
          preferredVendorId: form.preferredVendorId || null,
          responsibleMember: form.responsibleMember || null,
          nextDueDate: form.nextDueDate,
          recurrence: { interval: Number(form.interval), unit: form.unit },
          expectedCost: form.expectedCost,
          priority: form.priority,
          instructions: form.instructions,
          calendarSyncEnabled: form.calendarSyncEnabled,
        },
      })
      onWorkspaceChange(result.workspace)
      setForm(initialForm())
      setExpanded(false)
      setNotice('Maintenance plan created with its first work order ready for action.')
    } catch (reason) { setError(reason.message) }
    finally { setBusy('') }
  }

  const transition = async event => {
    const status = nextMaintenanceStatus(event.status)
    if (!status) return
    setBusy(event.id); setError(''); setNotice('')
    try {
      const result = await mutateEstateMaintenance({
        propertyId: workspace.propertyId,
        action: 'transition-event',
        eventId: event.id,
        status,
        actualCost: status === 'cost_recorded' ? costs[event.id] : undefined,
        expectedVersion: workspace.version,
      })
      onWorkspaceChange(result.workspace)
      setNotice(status === 'cost_recorded' ? `Cost recorded. The next service was generated for ${result.generated.event.scheduledFor}.` : `Maintenance moved to ${STATUS_LABELS[status].toLowerCase()}.`)
    } catch (reason) { setError(reason.message) }
    finally { setBusy('') }
  }

  const publishCalendar = async event => {
    setBusy(`calendar-${event.id}`); setError(''); setNotice('')
    try {
      const calendarLink = await syncEstateMaintenanceToFamilyCalendar(recordsForEvent(event))
      const result = await mutateEstateMaintenance({
        propertyId: workspace.propertyId,
        action: 'link-calendar',
        eventId: event.id,
        calendarLink,
        expectedVersion: workspace.version,
      })
      onWorkspaceChange(result.workspace)
      setNotice('Maintenance date published to the shared Family Calendar.')
    } catch (reason) { setError(reason.message) }
    finally { setBusy('') }
  }

  return <section className="estate-maintenance" id="estate-maintenance">
    <header>
      <div><p>Preventive Maintenance</p><h2>Plans that generate accountable work</h2><span>Plan → event → work order → cost → next service</span></div>
      {role === 'admin' && <button type="button" onClick={() => setExpanded(value => !value)}><i className={`ti ${expanded ? 'ti-x' : 'ti-plus'}`}/> {expanded ? 'Close' : 'New plan'}</button>}
    </header>
    {error && <div className="estate-operation-message is-error" role="alert"><i className="ti ti-alert-triangle"/> {error}</div>}
    {notice && <div className="estate-operation-message is-success" role="status"><i className="ti ti-circle-check"/> {notice}</div>}
    {expanded && <form className="estate-maintenance-form" onSubmit={createPlan}>
      <label className="is-wide"><span>Plan name</span><input required value={form.title} onChange={event => updateForm('title', event.target.value)} placeholder="Pool filter inspection"/></label>
      <label><span>Property system</span><select required value={form.systemId} onChange={event => updateForm('systemId', event.target.value)}><option value="">Choose system</option>{workspace.systems.map(system => <option key={system.id} value={system.id}>{system.name}</option>)}</select></label>
      <label><span>Asset</span><select value={form.assetId} onChange={event => updateForm('assetId', event.target.value)}><option value="">System-level plan</option>{workspace.assets.filter(asset => !form.systemId || asset.systemId === form.systemId).map(asset => <option key={asset.id} value={asset.id}>{asset.name || asset.title || asset.id}</option>)}</select></label>
      <label><span>First due date</span><input required type="date" value={form.nextDueDate} onChange={event => updateForm('nextDueDate', event.target.value)}/></label>
      <label><span>Responsible</span><select value={form.responsibleMember} onChange={event => updateForm('responsibleMember', event.target.value)}><option value="">Family</option>{MEMBERS.map(member => <option key={member}>{member}</option>)}</select></label>
      <label><span>Repeat every</span><div className="estate-recurrence"><input required type="number" min="1" max="365" value={form.interval} onChange={event => updateForm('interval', event.target.value)}/><select value={form.unit} onChange={event => updateForm('unit', event.target.value)}>{['days', 'weeks', 'months', 'years'].map(unit => <option key={unit}>{unit}</option>)}</select></div></label>
      <label><span>Preferred vendor</span><select value={form.preferredVendorId} onChange={event => updateForm('preferredVendorId', event.target.value)}><option value="">Not assigned</option>{workspace.vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.company || vendor.name || vendor.id}</option>)}</select></label>
      <label><span>Expected cost</span><input type="number" min="0" step="0.01" value={form.expectedCost} onChange={event => updateForm('expectedCost', event.target.value)} placeholder="0.00"/></label>
      <label><span>Priority</span><select value={form.priority} onChange={event => updateForm('priority', event.target.value)}>{['low', 'medium', 'high', 'critical'].map(priority => <option key={priority}>{priority}</option>)}</select></label>
      <label className="is-wide"><span>Service instructions</span><textarea value={form.instructions} onChange={event => updateForm('instructions', event.target.value)} placeholder="Inspection steps, service requirements, access notes…"/></label>
      <label className="estate-calendar-choice is-wide"><input type="checkbox" checked={form.calendarSyncEnabled} onChange={event => updateForm('calendarSyncEnabled', event.target.checked)}/><span>Make generated maintenance events eligible for the existing Family Calendar.</span></label>
      <button className="estate-form-submit is-wide" disabled={busy === 'create' || !workspace.systems.length}>{busy === 'create' ? 'Creating durable plan…' : 'Create plan and first work order'}</button>
    </form>}
    <div className="estate-maintenance-metrics">
      <div><strong>{plans.filter(plan => plan.status === 'active').length}</strong><span>Active plans</span></div>
      <div><strong>{activeEvents.filter(event => event.scheduledFor < todayKey()).length}</strong><span>Overdue</span></div>
      <div><strong>{activeEvents.filter(event => event.scheduledFor >= todayKey()).length}</strong><span>Upcoming</span></div>
      <div><strong>{workspace.maintenanceEvents.filter(event => event.status === 'cost_recorded').length}</strong><span>Costed services</span></div>
    </div>
    {activeEvents.length ? <div className="estate-maintenance-list">
      {activeEvents.map(event => {
        const { plan, workOrder } = recordsForEvent(event)
        const nextStatus = nextMaintenanceStatus(event.status)
        return <article key={event.id}>
          <div className="estate-maintenance-date"><strong>{new Date(`${event.scheduledFor}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong><span>{event.scheduledFor < todayKey() ? 'Overdue' : `Cycle ${event.occurrenceNumber}`}</span></div>
          <div className="estate-maintenance-detail"><span className={`estate-status is-${event.status}`}>{STATUS_LABELS[event.status]}</span><h3>{workOrder?.title || plan?.title}</h3><p>{plan?.responsibleMember || 'Family'} · {workspace.systems.find(system => system.id === plan?.systemId)?.name || 'General'}{plan?.expectedCost != null ? ` · $${Number(plan.expectedCost).toLocaleString()}` : ''}</p></div>
          <div className="estate-maintenance-actions">
            {event.calendar?.syncEnabled && event.status !== 'completed' && <button type="button" onClick={() => publishCalendar(event)} disabled={Boolean(busy)}><i className={`ti ${event.calendar?.syncedAt ? 'ti-calendar-check' : 'ti-calendar-plus'}`}/> {busy === `calendar-${event.id}` ? 'Publishing…' : event.calendar?.syncedAt ? 'Update calendar' : 'Publish calendar'}</button>}
            {nextStatus === 'cost_recorded' && <input aria-label={`Actual cost for ${workOrder?.title || plan?.title}`} type="number" min="0" step="0.01" placeholder="Actual cost" value={costs[event.id] || ''} onChange={change => setCosts(current => ({ ...current, [event.id]: change.target.value }))}/>} 
            {nextStatus && <button className="is-primary" type="button" onClick={() => transition(event)} disabled={Boolean(busy) || (nextStatus === 'cost_recorded' && (costs[event.id] === undefined || costs[event.id] === ''))}>{busy === event.id ? 'Saving…' : ACTION_LABELS[nextStatus]}</button>}
          </div>
        </article>
      })}
    </div> : <div className="estate-maintenance-empty"><i className="ti ti-calendar-cog"/><span><strong>No preventive maintenance plans yet</strong><small>Create a plan once; Brevity will carry each service through completion and generate the next cycle.</small></span></div>}
  </section>
}
