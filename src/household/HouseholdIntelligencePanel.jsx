import { useEffect, useMemo, useState } from 'react'
import { buildUnifiedHouseholdIntelligence } from './householdIntelligence.js'
import { SHARED_STATE_EVENT } from './sharedState.js'
import './HouseholdIntelligencePanel.css'

const money = value => Number(value || 0).toLocaleString('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 })

export default function HouseholdIntelligencePanel({ currentMember = 'Family', onOpenPillar }) {
  const [revision, setRevision] = useState(0)
  const model = useMemo(() => buildUnifiedHouseholdIntelligence({ currentMember }), [currentMember, revision])
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1)
    window.addEventListener('storage', refresh)
    window.addEventListener(SHARED_STATE_EVENT, refresh)
    window.addEventListener('brevity-household-finance-updated', refresh)
    window.addEventListener('brevity-family-calendar-updated', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(SHARED_STATE_EVENT, refresh)
      window.removeEventListener('brevity-household-finance-updated', refresh)
      window.removeEventListener('brevity-family-calendar-updated', refresh)
    }
  }, [])
  const open = action => onOpenPillar?.(action === 'finance' ? 'finance' : 'household')
  const canNavigate = typeof onOpenPillar === 'function'

  return <section className={`household-intelligence${model.allClear ? ' is-clear' : ''}`} aria-label="Household operating intelligence">
    <header><div><span>Household Operating Intelligence</span><h2>{model.allClear ? 'Household operating normally' : `${model.signals.length} item${model.signals.length === 1 ? '' : 's'} need attention`}</h2></div>{canNavigate && <button type="button" onClick={() => open('household')}>Open Household Management <i className="ti ti-arrow-right" /></button>}</header>
    <div className="household-intelligence-metrics">
      <article><span>My responsibilities today</span><strong>{model.metrics.myResponsibilitiesToday}</strong></article>
      <article className={model.metrics.householdOverdue ? 'is-alert' : ''}><span>Household overdue</span><strong>{model.metrics.householdOverdue}</strong></article>
      <article><span>Low stock</span><strong>{model.metrics.lowStock}</strong></article>
      <article><span>Use soon / expired</span><strong>{model.metrics.useSoon}</strong></article>
      <article className={model.metrics.monthlyWaste ? 'is-waste' : ''}><span>Waste this month</span><strong>{money(model.metrics.monthlyWaste)}</strong></article>
      <article><span>Projected obligations</span><strong>{money(model.metrics.projectedObligations)}</strong></article>
    </div>
    {model.signals.length ? <div className="household-intelligence-signals">{model.signals.slice(0, 6).map(signal => canNavigate ? <button type="button" key={signal.id} className={`household-intelligence-signal is-${signal.priority}`} onClick={() => open(signal.action)}><i className={`ti ${signal.icon}`} /><span><strong>{signal.title}</strong><small>{signal.detail}</small></span><i className="ti ti-chevron-right" /></button> : <article key={signal.id} className={`household-intelligence-signal is-${signal.priority}`}><i className={`ti ${signal.icon}`} /><span><strong>{signal.title}</strong><small>{signal.detail}</small></span></article>)}</div> : <div className="household-intelligence-clear"><i className="ti ti-circle-check"/><span><strong>No household operating exceptions</strong><small>Responsibilities, inventory, Estate obligations, and waste controls are within the current operating thresholds.</small></span></div>}
  </section>
}
