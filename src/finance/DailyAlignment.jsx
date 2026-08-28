import { useMemo, useState } from 'react'
import { addDays, fmtMoney, parseISODate, toISO } from './projection.js'
import {
  ALIGNMENT_PEOPLE,
  DEFAULT_MONTHLY_SURPLUS_VISION,
  buildDailyAlignmentSnapshot,
  normalizeDailyAlignmentRecord,
} from './dailyAlignmentData.js'
import './DailyAlignment.css'

const ALIGNMENT_STORAGE_KEY = 'brevity_daily_financial_alignment_v1'

function loadAlignmentStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ALIGNMENT_STORAGE_KEY) || '{}')
    return {
      version: 1,
      settings: {
        monthlySurplusVision: DEFAULT_MONTHLY_SURPLUS_VISION,
        purchaseThreshold: '',
        ...(parsed.settings || {}),
      },
      records: parsed.records || {},
    }
  } catch {
    return { version: 1, settings: { monthlySurplusVision: DEFAULT_MONTHLY_SURPLUS_VISION, purchaseThreshold: '' }, records: {} }
  }
}

function Metric({ label, value, note, icon, tone = 'gold', onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`alignment-metric alignment-metric--${tone}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      <span className="alignment-metric-icon"><i className={`ti ${icon}`} aria-hidden="true" /></span>
      <span className="alignment-metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="alignment-metric-note">{note}</span>
    </Tag>
  )
}

function CompletionToggle({ checked, onChange, label = 'Complete' }) {
  return (
    <label className="alignment-complete">
      <input type="checkbox" checked={Boolean(checked)} onChange={event => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export default function DailyAlignment({ accounts, scheduled, cashFlowScheduled, actuals, budget, projection, onNavigate, onOpenCalendar, onOpenActual }) {
  const todayKey = toISO(new Date())
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [store, setStore] = useState(loadAlignmentStore)
  const [savedAt, setSavedAt] = useState('')
  const record = normalizeDailyAlignmentRecord(store.records[selectedDate])

  const snapshot = useMemo(() => buildDailyAlignmentSnapshot({
    date: selectedDate,
    accounts,
    scheduled,
    monthlyScheduled: cashFlowScheduled,
    actuals,
    budget,
    projectedBalance: selectedDate === todayKey ? undefined : projection?.get(selectedDate)?.bal,
  }), [selectedDate, todayKey, accounts, scheduled, cashFlowScheduled, actuals, budget, projection])

  const selectedDateObject = parseISODate(selectedDate) || new Date()
  const selectedLabel = selectedDateObject.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const monthlyVision = Number(store.settings.monthlySurplusVision) || 0
  const visionPct = monthlyVision > 0 ? Math.min(Math.max((snapshot.monthlyCashFlow / monthlyVision) * 100, 0), 100) : 0
  const visionGap = Math.max(monthlyVision - snapshot.monthlyCashFlow, 0)
  const cashFlowLabel = snapshot.monthlyCashFlowSource === 'actual' ? 'Posted / pending net cash flow' : 'Scheduled net cash flow'

  const persist = next => {
    setStore(next)
    try {
      localStorage.setItem(ALIGNMENT_STORAGE_KEY, JSON.stringify(next))
      setSavedAt(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
    } catch {
      setSavedAt('Save failed')
    }
  }

  const updateSettings = patch => persist({ ...store, settings: { ...store.settings, ...patch } })
  const updateRecord = nextRecord => persist({ ...store, records: { ...store.records, [selectedDate]: nextRecord } })
  const updatePersonRow = (section, person, field, value) => {
    updateRecord({ ...record, [section]: record[section].map(row => row.person === person ? { ...row, [field]: value } : row) })
  }
  const updateDecision = (index, field, value) => {
    updateRecord({ ...record, decisions: record.decisions.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row) })
  }
  const moveDate = days => setSelectedDate(toISO(addDays(selectedDateObject, days)))

  const threshold = Number(store.settings.purchaseThreshold) || 0

  return (
    <div className="daily-alignment">
      <header className="alignment-hero">
        <div>
          <p className="alignment-kicker">The end from the beginning</p>
          <h1>Daily Family Financial Alignment</h1>
          <p>One family. One direction. A focused daily review of cash, action, and accountability.</p>
        </div>
        <div className="alignment-date-control" aria-label="Alignment date">
          <button type="button" onClick={() => moveDate(-1)} aria-label="Previous day"><i className="ti ti-chevron-left" /></button>
          <div>
            <span>Alignment date</span>
            <strong>{selectedLabel}</strong>
          </div>
          <button type="button" onClick={() => moveDate(1)} aria-label="Next day"><i className="ti ti-chevron-right" /></button>
          {selectedDate !== todayKey && <button className="alignment-today" type="button" onClick={() => setSelectedDate(todayKey)}>Today</button>}
        </div>
      </header>

      <section className="alignment-vision">
        <div>
          <span>Monthly cash flow goal</span>
          <label className="alignment-money-input">
            <span>$</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={store.settings.monthlySurplusVision}
              onChange={event => updateSettings({ monthlySurplusVision: event.target.value })}
              aria-label="Monthly cash flow goal"
            />
          </label>
        </div>
        <div className="alignment-vision-progress">
          <div><span>{cashFlowLabel}</span><strong>{fmtMoney(snapshot.monthlyCashFlow)}</strong></div>
          <div className="alignment-vision-breakdown">
            <small>Income {fmtMoney(snapshot.monthlyIncome)}</small>
            <small>Expenses {fmtMoney(snapshot.monthlyExpenses)}</small>
          </div>
          <div className="alignment-progress-track"><span style={{ width: `${visionPct}%` }} /></div>
          <div className="alignment-vision-status">
            <small>{monthlyVision ? `${visionPct.toFixed(1)}% of ${fmtMoney(monthlyVision)} net goal` : 'Set a monthly net cash flow goal'}</small>
            {monthlyVision > 0 && <strong>{fmtMoney(visionGap)} short of goal</strong>}
          </div>
        </div>
        <p>Today’s alignment protects the next step.</p>
      </section>

      <section className="alignment-section">
        <div className="alignment-section-heading">
          <div><span>Daily truth</span><h2>Today’s truth in four numbers.</h2></div>
          <small>Live from selected accounts, Plaid activity, scheduled transactions, and budget data</small>
        </div>
        <div className="alignment-metrics">
          <Metric label="Available operating cash" value={fmtMoney(snapshot.availableOperatingCash)} note="Current or projected selected-account balance" icon="ti-wallet" onClick={() => onNavigate('accounts')} />
          <Metric label="Expected inflows" value={fmtMoney(snapshot.expectedInflows)} note="Not yet received · today and tomorrow" icon="ti-arrow-down-left" tone="income" onClick={() => onOpenCalendar(selectedDate)} />
          <Metric label="Due today / tomorrow" value={fmtMoney(snapshot.dueTodayTomorrow)} note="Outstanding scheduled obligations" icon="ti-calendar-due" tone="expense" onClick={() => onOpenCalendar(selectedDate)} />
          <Metric label="Approved discretionary" value={fmtMoney(snapshot.approvedDiscretionary)} note={`${fmtMoney(snapshot.discretionarySpent)} spent of ${fmtMoney(snapshot.discretionaryBudget)} monthly`} icon="ti-shield-check" onClick={() => onNavigate('budget')} />
        </div>
        <div className="alignment-status-key">
          <div><strong>Posted</strong><span>The institution completed the transaction.</span></div>
          <div><strong>Pending</strong><span>The amount may change before posting.</span></div>
          <div><strong>Expected</strong><span>Planned or promised; it is not cash yet.</span></div>
        </div>
      </section>

      <section className="alignment-section">
        <div className="alignment-section-heading">
          <div><span>Cash movement</span><h2>What money is moving today?</h2></div>
          <small>Only this day’s cash movement appears here</small>
        </div>
        <div className="alignment-cash-layout">
          <div className="alignment-movement-list">
            <div className="alignment-table-head"><span>Item</span><span>Amount</span><span>Status</span><span>Action</span></div>
            {snapshot.movements.length === 0 && <div className="alignment-empty">No posted, pending, or expected transactions for this date.</div>}
            {snapshot.movements.map(movement => (
              <button
                type="button"
                className="alignment-movement"
                key={movement.id}
                onClick={() => movement.source === 'actual' ? onOpenActual(movement.transaction) : onOpenCalendar(selectedDate)}
              >
                <span><i className={`ti ti-${movement.direction === 'income' ? 'arrow-down-left' : 'arrow-up-right'}`} /> <span><strong>{movement.name}</strong><small>{movement.category}</small></span></span>
                <strong className={movement.direction}>{movement.direction === 'income' ? '+' : '-'}{fmtMoney(movement.amount)}</strong>
                <span className={`alignment-status alignment-status--${movement.status.toLowerCase()}`}>{movement.status}</span>
                <span className="alignment-row-action">View <i className="ti ti-chevron-right" /></span>
              </button>
            ))}
          </div>
          <aside className="alignment-watch">
            <h3>Watch today</h3>
            <div><span>01</span><p><strong>Balance risk</strong>{snapshot.risks.balance}</p></div>
            <div><span>02</span><p><strong>Unexpected amount</strong>{snapshot.risks.unexpected}</p></div>
            <div><span>03</span><p><strong>Timing or posting</strong>{snapshot.risks.timing}</p></div>
          </aside>
        </div>
      </section>

      <section className="alignment-section">
        <div className="alignment-section-heading">
          <div><span>Income execution</span><h2>Every person names one measurable income action.</h2></div>
          <small>One action. One owner. One completion time.</small>
        </div>
        <div className="alignment-action-grid alignment-action-head"><span>Person</span><span>Yesterday’s result</span><span>Today’s measurable action</span><span>Complete by</span><span>Status</span></div>
        {record.actions.map(row => (
          <div className="alignment-action-grid" key={row.person}>
            <strong>{row.person}</strong>
            <input value={row.yesterday} onChange={event => updatePersonRow('actions', row.person, 'yesterday', event.target.value)} placeholder="Result or outcome" />
            <input value={row.action} onChange={event => updatePersonRow('actions', row.person, 'action', event.target.value)} placeholder="Specific income-producing action" />
            <input type="time" value={row.due} onChange={event => updatePersonRow('actions', row.person, 'due', event.target.value)} />
            <CompletionToggle checked={row.complete} onChange={value => updatePersonRow('actions', row.person, 'complete', value)} />
          </div>
        ))}
      </section>

      <section className="alignment-section">
        <div className="alignment-section-heading alignment-decision-heading">
          <div><span>Exceptions & decisions</span><h2>Decide only what cannot wait.</h2></div>
          <label>Family purchase threshold <span>$</span><input type="number" min="0" value={store.settings.purchaseThreshold} onChange={event => updateSettings({ purchaseThreshold: event.target.value })} placeholder="Set amount" /></label>
        </div>
        <p className="alignment-rule">A decision belongs here when delay creates cash risk, misses a deadline, or {threshold ? `crosses the ${fmtMoney(threshold)} family purchase threshold` : 'crosses the family purchase threshold'}.</p>
        <div className="alignment-decision-grid alignment-action-head"><span>#</span><span>Issue</span><span>Decision</span><span>Owner</span><span>Due</span><span>Status</span></div>
        {record.decisions.map((row, index) => (
          <div className="alignment-decision-grid" key={index}>
            <strong>{String(index + 1).padStart(2, '0')}</strong>
            <input value={row.issue} onChange={event => updateDecision(index, 'issue', event.target.value)} placeholder="Amount, deadline, consequence" />
            <input value={row.decision} onChange={event => updateDecision(index, 'decision', event.target.value)} placeholder="Decision" />
            <select value={row.owner} onChange={event => updateDecision(index, 'owner', event.target.value)}><option value="">Select</option>{ALIGNMENT_PEOPLE.map(person => <option key={person}>{person}</option>)}</select>
            <input type="time" value={row.due} onChange={event => updateDecision(index, 'due', event.target.value)} />
            <CompletionToggle checked={row.complete} onChange={value => updateDecision(index, 'complete', value)} />
          </div>
        ))}
      </section>

      <section className="alignment-section alignment-covenant">
        <div className="alignment-section-heading">
          <div><span>The daily covenant</span><h2>We leave with commitments, not conversation.</h2></div>
          <small>Complete the action. Honor the limit. Report the truth.</small>
        </div>
        <div className="alignment-commitments">
          {record.commitments.map(row => (
            <div key={row.person} className={row.complete ? 'is-complete' : ''}>
              <strong>{row.person}</strong>
              <label>I will complete<input value={row.commitment} onChange={event => updatePersonRow('commitments', row.person, 'commitment', event.target.value)} placeholder="Commitment" /></label>
              <label>by<input type="time" value={row.due} onChange={event => updatePersonRow('commitments', row.person, 'due', event.target.value)} /></label>
              <CompletionToggle checked={row.complete} onChange={value => updatePersonRow('commitments', row.person, 'complete', value)} label="Done" />
            </div>
          ))}
        </div>
        <footer><span>Jenkins–Seay Family</span><strong>Unity turns daily discipline into financial capacity.</strong><span>{savedAt ? `Saved ${savedAt}` : 'Changes save automatically'}</span></footer>
      </section>
    </div>
  )
}
