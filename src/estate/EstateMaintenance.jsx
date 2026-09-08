import { useMemo } from 'react'
import { getHouseholdDateKey } from '../finance/financeTime.js'

const STATUS_LABELS = {
  due: 'Due',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cost_recorded: 'Cost recorded',
}

export default function EstateMaintenance({ workspace }) {
  const today = getHouseholdDateKey(new Date())
  const plans = workspace.maintenancePlans || []
  const activeEvents = useMemo(() => (workspace.maintenanceEvents || [])
    .filter(event => event.status !== 'cost_recorded')
    .sort((left, right) => String(left.scheduledFor).localeCompare(String(right.scheduledFor))), [workspace.maintenanceEvents])

  return <section className="estate-maintenance" id="estate-maintenance">
    <header>
      <div>
        <p>Preventive Maintenance</p>
        <h2>Plans that generate accountable work</h2>
        <span>Plan → event → work order → cost → next service</span>
      </div>
      <span className="estate-status is-scheduled">Read only</span>
    </header>

    <div className="estate-operation-message" role="status">
      <i className="ti ti-shield-lock" /> Estate maintenance changes are paused until they can use reviewed Action Mode, Audit History, safe Undo, and atomic Calendar publication. Existing records remain available below.
    </div>

    <div className="estate-maintenance-metrics">
      <div><strong>{plans.filter(plan => plan.status === 'active').length}</strong><span>Active plans</span></div>
      <div><strong>{activeEvents.filter(event => event.scheduledFor < today).length}</strong><span>Overdue</span></div>
      <div><strong>{activeEvents.filter(event => event.scheduledFor >= today).length}</strong><span>Upcoming</span></div>
      <div><strong>{(workspace.maintenanceEvents || []).filter(event => event.status === 'cost_recorded').length}</strong><span>Costed services</span></div>
    </div>

    {activeEvents.length ? <div className="estate-maintenance-list">
      {activeEvents.map(event => {
        const plan = plans.find(item => item.id === event.maintenancePlanId)
        const workOrder = (workspace.workOrders || []).find(item => item.id === event.workOrderId)
        return <article key={event.id}>
          <div className="estate-maintenance-date">
            <strong>{new Date(`${event.scheduledFor}T12:00:00-04:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone:'America/New_York' })}</strong>
            <span>{event.scheduledFor < today ? 'Overdue' : `Cycle ${event.occurrenceNumber}`}</span>
          </div>
          <div className="estate-maintenance-detail">
            <span className={`estate-status is-${event.status}`}>{STATUS_LABELS[event.status] || event.status}</span>
            <h3>{workOrder?.title || plan?.title}</h3>
            <p>{plan?.responsibleMember || 'Family'} · {workspace.systems.find(system => system.id === plan?.systemId)?.name || 'General'}{plan?.expectedCost != null ? ` · $${Number(plan.expectedCost).toLocaleString()}` : ''}</p>
          </div>
        </article>
      })}
    </div> : <div className="estate-maintenance-empty">
      <i className="ti ti-calendar-cog" />
      <span><strong>No preventive maintenance plans yet</strong><small>Reviewed plan creation will return when Estate maintenance joins Action Mode.</small></span>
    </div>}
  </section>
}
