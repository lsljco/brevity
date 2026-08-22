import { useMemo, useState } from 'react'
import {
  calculateScenario,
  cloneDefaultScenarioModel,
  SCENARIO_STORAGE_KEY,
} from './scenarioModelingData.js'
import './ScenarioModeling.css'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const wholeMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function loadModel() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SCENARIO_STORAGE_KEY) || 'null')
    if (parsed?.scenarios?.length) return parsed
  } catch {}
  return cloneDefaultScenarioModel()
}

function saveModel(model) {
  try { localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(model)) } catch {}
}

function SummaryMetric({ label, value, tone = '' }) {
  return <div className={`scenario-metric${tone ? ` scenario-metric--${tone}` : ''}`}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
}

export default function ScenarioModeling({ liveOperatingExpense = 0 }) {
  const [model, setModel] = useState(loadModel)
  const [activeId, setActiveId] = useState(() => loadModel().scenarios[0]?.id || 'current')
  const activeIndex = Math.max(0, model.scenarios.findIndex(scenario => scenario.id === activeId))
  const active = model.scenarios[activeIndex]
  const expense = model.expenseMode === 'operating' && liveOperatingExpense > 0
    ? liveOperatingExpense
    : Number(model.planningExpense) || 0
  const result = useMemo(() => calculateScenario(active, expense), [active, expense])

  const commit = updater => {
    setModel(current => {
      const next = typeof updater === 'function' ? updater(current) : updater
      saveModel(next)
      return next
    })
  }

  const updateModel = changes => commit(current => ({ ...current, ...changes }))
  const updateScenario = changes => commit(current => ({
    ...current,
    scenarios: current.scenarios.map((scenario, index) => index === activeIndex ? { ...scenario, ...changes } : scenario),
  }))
  const updateIncome = (rowIndex, field, value) => updateScenario({
    incomes: active.incomes.map((row, index) => index === rowIndex ? { ...row, [field]: value } : row),
  })
  const removeIncome = rowIndex => updateScenario({ incomes: active.incomes.filter((_, index) => index !== rowIndex) })
  const addIncome = () => updateScenario({
    incomes: [...active.incomes, {
      id: `income-${Date.now()}`,
      description: 'New income source', monthlyNet: 0, annualGross: 0,
      contribution: 0, remote: false, employment: '', notes: '',
    }],
  })
  const reset = () => {
    if (!window.confirm('Reset all three scenarios to the supplied starting model?')) return
    const next = cloneDefaultScenarioModel()
    saveModel(next)
    setModel(next)
    setActiveId(next.scenarios[0].id)
  }

  return <section className="scenario-page" aria-labelledby="scenario-title">
    <header className="scenario-header">
      <div>
        <p className="scenario-eyebrow">Finance · Forward planning</p>
        <h1 id="scenario-title">Scenario Modeling</h1>
        <p>Compare household income paths against recurring operating expenses. Every total recalculates as assumptions change.</p>
      </div>
      <button type="button" className="scenario-reset" onClick={reset}><i className="ti ti-restore"/> Reset supplied model</button>
    </header>

    <div className="scenario-tabs" role="tablist" aria-label="Financial scenarios">
      {model.scenarios.map(scenario => {
        const summary = calculateScenario(scenario, expense)
        const selected = scenario.id === active.id
        return <button key={scenario.id} type="button" role="tab" aria-selected={selected} className={selected ? 'is-active' : ''} onClick={() => setActiveId(scenario.id)}>
          <span>{scenario.title}</span>
          <strong className={summary.monthlyCashFlow >= 0 ? 'positive' : 'negative'}>{money.format(summary.monthlyCashFlow)} / month</strong>
        </button>
      })}
    </div>

    <div className="scenario-expense-panel">
      <div>
        <span className="scenario-field-label">Expense baseline</span>
        <strong>{money.format(expense)} monthly</strong>
        <small>{model.expenseMode === 'operating' && liveOperatingExpense > 0 ? 'Live recurring expenses from the Operating Account' : 'Supplied scenario planning baseline'}</small>
      </div>
      <div className="scenario-expense-controls">
        <div className="scenario-segmented" aria-label="Expense source">
          <button type="button" className={model.expenseMode === 'scenario' ? 'is-active' : ''} onClick={() => updateModel({ expenseMode: 'scenario' })}>Planning baseline</button>
          <button type="button" disabled={liveOperatingExpense <= 0} className={model.expenseMode === 'operating' ? 'is-active' : ''} onClick={() => updateModel({ expenseMode: 'operating' })}>Live operating</button>
        </div>
        {model.expenseMode === 'scenario' && <label className="scenario-money-input"><span>$</span><input aria-label="Monthly planning expense" type="number" min="0" step="0.01" value={model.planningExpense} onChange={event => updateModel({ planningExpense: event.target.value })}/></label>}
      </div>
    </div>

    <section className="scenario-summary" aria-label={`${active.title} summary`}>
      <SummaryMetric label="Monthly net income" value={money.format(result.monthlyNetIncome)} />
      <SummaryMetric label="Recurring expenses" value={money.format(result.monthlyExpense)} tone="expense" />
      <SummaryMetric label="Monthly cash flow" value={money.format(result.monthlyCashFlow)} tone={result.monthlyCashFlow >= 0 ? 'positive' : 'expense'} />
      <SummaryMetric label="Annual cash flow" value={money.format(result.annualCashFlow)} tone={result.annualCashFlow >= 0 ? 'positive' : 'expense'} />
    </section>

    <section className="scenario-editor">
      <div className="scenario-section-heading">
        <div>
          <input className="scenario-title-input" aria-label="Scenario name" value={active.title} onChange={event => updateScenario({ title: event.target.value })}/>
          <input className="scenario-description-input" aria-label="Scenario description" value={active.description || ''} onChange={event => updateScenario({ description: event.target.value })}/>
        </div>
        <button type="button" className="scenario-add" onClick={addIncome}><i className="ti ti-plus"/> Add income</button>
      </div>

      <div className="scenario-table-wrap">
        <table className="scenario-table">
          <thead><tr><th>Description</th><th>Monthly net</th><th>Annual gross</th><th>Contribution</th><th>Work</th><th>Employment</th><th>Notes</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{active.incomes.map((row, rowIndex) => <tr key={row.id}>
            <td><input aria-label={`Income ${rowIndex + 1} description`} value={row.description} onChange={event => updateIncome(rowIndex, 'description', event.target.value)}/></td>
            <td><label className="scenario-cell-money"><span>$</span><input aria-label={`${row.description} monthly net`} type="number" step="0.01" value={row.monthlyNet} onChange={event => updateIncome(rowIndex, 'monthlyNet', event.target.value)}/></label></td>
            <td><label className="scenario-cell-money"><span>$</span><input aria-label={`${row.description} annual gross`} type="number" step="0.01" value={row.annualGross} onChange={event => updateIncome(rowIndex, 'annualGross', event.target.value)}/></label></td>
            <td><label className="scenario-cell-percent"><input aria-label={`${row.description} contribution`} type="number" step="1" value={row.contribution} onChange={event => updateIncome(rowIndex, 'contribution', event.target.value)}/><span>%</span></label></td>
            <td><button type="button" className={`scenario-remote${row.remote ? ' is-active' : ''}`} aria-pressed={row.remote} onClick={() => updateIncome(rowIndex, 'remote', !row.remote)}>{row.remote ? 'Remote' : 'On-site'}</button></td>
            <td><input aria-label={`${row.description} employment type`} value={row.employment || ''} placeholder="Perm / Contract" onChange={event => updateIncome(rowIndex, 'employment', event.target.value)}/></td>
            <td><input aria-label={`${row.description} notes`} value={row.notes || ''} placeholder="Add note" onChange={event => updateIncome(rowIndex, 'notes', event.target.value)}/></td>
            <td><button type="button" className="scenario-delete" aria-label={`Delete ${row.description}`} onClick={() => removeIncome(rowIndex)}><i className="ti ti-trash"/></button></td>
          </tr>)}</tbody>
          <tfoot><tr><th>Total</th><th>{money.format(result.monthlyNetIncome)}</th><th>{money.format(result.annualGrossIncome)}</th><th>{result.contribution}%</th><th colSpan="4"/></tr></tfoot>
        </table>
      </div>
    </section>

    <section className="scenario-projections">
      <div className="scenario-section-heading">
        <div><p className="scenario-eyebrow">Cumulative projection</p><h2>Cash flow over time</h2></div>
        <p>Assumes the modeled monthly income and expense baseline remain constant.</p>
      </div>
      <div className="scenario-projection-grid">
        <div><span>1 year</span><strong>{wholeMoney.format(result.annualCashFlow)}</strong></div>
        {[2, 3, 4, 5].map(year => <div key={year}><span>{year} years</span><strong>{wholeMoney.format(result.projections[year])}</strong></div>)}
      </div>
    </section>
  </section>
}

