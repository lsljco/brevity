import { useEffect, useMemo, useState } from 'react'
import { prepareDirectAction } from '../assistant/assistantApi.js'
import { requestActionReview } from '../assistant/actionEvents.js'
import { getAcknowledgedSharedStateVersion, SHARED_STATE_EVENT } from '../household/sharedState.js'
import {
  calculateScenario,
  cloneDefaultScenarioModel,
  SCENARIO_STORAGE_KEY,
} from './scenarioModelingData.js'
import './ScenarioModeling.css'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const wholeMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function loadModel(storage = localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(SCENARIO_STORAGE_KEY) || 'null')
    if (parsed?.scenarios?.length) return parsed
  } catch {}
  return cloneDefaultScenarioModel()
}

const clone = value => JSON.parse(JSON.stringify(value))
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const quote = value => `“${String(value || '').trim().slice(0, 72)}${String(value || '').trim().length > 72 ? '…' : ''}”`
const incomeFields = ['description', 'monthlyNet', 'annualGross', 'contribution', 'remote', 'employment', 'notes']
const numericIncomeFields = new Set(['monthlyNet', 'annualGross', 'contribution'])

const createIncomeId = () => `income-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

function changedFields(before, draft, fields) {
  return Object.fromEntries(fields.flatMap(field => {
    let next = draft?.[field]
    if (numericIncomeFields.has(field)) {
      next = Number(next)
      if (!Number.isFinite(next)) throw new Error(`${field.replace(/([A-Z])/g, ' $1').toLowerCase()} must be a valid number.`)
    }
    return same(before?.[field], next) ? [] : [[field, next]]
  }))
}

function SummaryMetric({ label, value, tone = '' }) {
  return <div className={`scenario-metric${tone ? ` scenario-metric--${tone}` : ''}`}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
}

export default function ScenarioModeling({ liveOperatingExpense = 0, readOnly = false }) {
  const initialModel = useMemo(() => loadModel(), [])
  const [model, setModel] = useState(initialModel)
  const [draftModel, setDraftModel] = useState(() => clone(initialModel))
  const [activeId, setActiveId] = useState(() => initialModel.scenarios[0]?.id || 'current')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewNotice, setReviewNotice] = useState('')
  const activeIndex = Math.max(0, model.scenarios.findIndex(scenario => scenario.id === activeId))
  const active = model.scenarios[activeIndex]
  const activeDraft = draftModel.scenarios.find(scenario => scenario.id === active?.id) || active
  const expense = model.expenseMode === 'operating' && liveOperatingExpense > 0
    ? liveOperatingExpense
    : Number(model.planningExpense) || 0
  const result = useMemo(() => calculateScenario(active, expense), [active, expense])

  useEffect(() => {
    const refresh = event => {
      if (event?.type === 'storage' && event.key && event.key !== SCENARIO_STORAGE_KEY) return
      if (event?.type === SHARED_STATE_EVENT && event.detail?.keys?.length && !event.detail.keys.includes(SCENARIO_STORAGE_KEY)) return
      const next = loadModel()
      setModel(next)
      setDraftModel(clone(next))
      setActiveId(current => next.scenarios.some(scenario => scenario.id === current) ? current : next.scenarios[0]?.id || 'current')
      setReviewError('')
      setReviewNotice('The reviewed forecast is now current.')
    }
    window.addEventListener(SHARED_STATE_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(SHARED_STATE_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const updateModelDraft = changes => {
    if (readOnly) return
    setDraftModel(current => ({ ...current, ...changes }))
    setReviewError('')
    setReviewNotice('Draft only — review and approve before Brevity changes the forecast.')
  }
  const updateScenarioDraft = changes => {
    if (readOnly) return
    setDraftModel(current => ({
    ...current,
    scenarios: current.scenarios.map((scenario, index) => index === activeIndex ? { ...scenario, ...changes } : scenario),
  }))
    setReviewError('')
    setReviewNotice('Draft only — review and approve before Brevity changes the forecast.')
  }
  const updateIncomeDraft = (incomeId, field, value) => {
    if (readOnly) return
    setDraftModel(current => ({
      ...current,
      scenarios:current.scenarios.map(scenario => scenario.id !== active.id ? scenario : {
        ...scenario,
        incomes:scenario.incomes.map(row => row.id === incomeId ? { ...row, [field]:value } : row),
      }),
    }))
    setReviewError('')
    setReviewNotice('Draft only — review and approve before Brevity changes the forecast.')
  }
  const addIncomeDraft = () => {
    if (readOnly) return
    const income = { id:createIncomeId(), description:'', monthlyNet:'', annualGross:'', contribution:'', remote:true, employment:'', notes:'' }
    setDraftModel(current => ({
      ...current,
      scenarios:current.scenarios.map(scenario => scenario.id !== active.id ? scenario : {
        ...scenario,
        incomes:[...(scenario.incomes || []), income],
      }),
    }))
    setReviewError('')
    setReviewNotice('New income source drafted. Complete its details, then review it.')
  }
  const discardIncomeDraft = incomeId => {
    setDraftModel(current => ({
      ...current,
      scenarios:current.scenarios.map(scenario => scenario.id !== active.id ? scenario : {
        ...scenario,
        incomes:scenario.incomes.filter(row => row.id !== incomeId),
      }),
    }))
    setReviewError('')
    setReviewNotice('Income draft discarded. The shared forecast was unchanged.')
  }

  const openReview = async ({ summary, operation }) => {
    if (readOnly || reviewBusy) return
    setReviewBusy(true)
    setReviewError('')
    setReviewNotice('')
    try {
      if (!localStorage.getItem(SCENARIO_STORAGE_KEY)) {
        throw new Error('The shared forecast has not finished loading. Refresh Brevity before editing so Action Mode can verify its version.')
      }
      const expectedVersion = getAcknowledgedSharedStateVersion(localStorage, SCENARIO_STORAGE_KEY)
      const result = await prepareDirectAction({ summary, operation, expectedVersion })
      if (!result?.proposal?.id) throw new Error('Action Mode did not return a reviewable forecast proposal.')
      requestActionReview(result.proposal)
      setReviewNotice('Review opened. No forecast value changes until you approve it.')
    } catch (error) {
      setReviewError(error.message || 'Brevity could not prepare this forecast change for review.')
    } finally { setReviewBusy(false) }
  }

  const reviewExpenseMode = expenseMode => {
    if (expenseMode === model.expenseMode) return
    void openReview({
      summary:'Update the Scenario Modeling expense source',
      operation:{
        type:'forecast.update', targetId:'model', payload:{ expenseMode },
        description:`Use the ${expenseMode === 'operating' ? 'live Operating Account expenses' : 'scenario planning baseline'} for forecast calculations.`,
      },
    })
  }
  const reviewPlanningExpense = () => {
    const planningExpense = Number(draftModel.planningExpense)
    if (!Number.isFinite(planningExpense) || planningExpense < 0) {
      setReviewError('Monthly planning expense must be a non-negative number.')
      return
    }
    if (planningExpense === Number(model.planningExpense) && model.expenseMode === 'scenario') return
    const payload = { planningExpense }
    if (model.expenseMode !== 'scenario') payload.expenseMode = 'scenario'
    void openReview({
      summary:'Update total monthly recurring expenses in Scenario Modeling',
      operation:{
        type:'forecast.update', targetId:'model', payload,
        description:`Use ${money.format(planningExpense)} as the reviewed monthly recurring-expense total${model.expenseMode === 'operating' ? ' instead of the live Operating Account total' : ''}.`,
      },
    })
  }
  const reviewScenario = () => {
    try {
      const payload = changedFields(active, activeDraft, ['title', 'description'])
      if (!String(activeDraft.title || '').trim()) throw new Error('Scenario name is required.')
      if (!Object.keys(payload).length) return
      void openReview({
        summary:`Update forecast scenario ${quote(active.title)}`,
        operation:{ type:'forecast.update', targetId:active.id, payload, description:`Update the name or purpose of ${quote(active.title)}.` },
      })
    } catch (error) { setReviewError(error.message) }
  }
  const reviewIncome = incomeId => {
    try {
      const before = active.incomes.find(row => row.id === incomeId)
      const draft = activeDraft.incomes.find(row => row.id === incomeId)
      if (!draft) throw new Error('That income source is no longer available. Refresh Brevity and try again.')
      if (!String(draft.description || '').trim()) throw new Error('Income source description is required.')
      const normalized = { ...draft, ...changedFields({}, draft, ['monthlyNet', 'annualGross', 'contribution']) }
      if (['monthlyNet', 'annualGross', 'contribution'].some(field => normalized[field] < 0)) throw new Error('Income amounts and contribution cannot be negative.')
      if (!before) {
        void openReview({
          summary:`Add income source ${quote(draft.description)}`,
          operation:{
            type:'forecast.update', targetId:active.id,
            payload:{ incomeAction:'create', incomeId:draft.id, ...Object.fromEntries(incomeFields.map(field => [field, normalized[field]])) },
            description:`Add ${quote(draft.description)} to ${quote(active.title)} after review.`,
          },
        })
        return
      }
      const payload = changedFields(before, draft, incomeFields)
      if (!Object.keys(payload).length) return
      void openReview({
        summary:`Update forecast assumptions for ${quote(before.description)}`,
        operation:{
          type:'forecast.update', targetId:active.id, payload:{ incomeId, ...payload },
          description:`Update reviewed forecast assumptions for ${quote(before.description)} in ${quote(active.title)}.`,
        },
      })
    } catch (error) { setReviewError(error.message) }
  }
  const reviewRemoveIncome = incomeId => {
    const before = active.incomes.find(row => row.id === incomeId)
    if (!before) {
      discardIncomeDraft(incomeId)
      return
    }
    void openReview({
      summary:`Remove income source ${quote(before.description)}`,
      operation:{
        type:'forecast.update', targetId:active.id, payload:{ incomeAction:'delete', incomeId },
        description:`Remove ${quote(before.description)} from ${quote(active.title)} after review.`,
      },
    })
  }

  return <section className="scenario-page" aria-labelledby="scenario-title">
    <header className="scenario-header">
      <div>
        <p className="scenario-eyebrow">Finance · Forward planning</p>
        <h1 id="scenario-title">Scenario Modeling</h1>
        <p>Compare household income paths against recurring operating expenses. Draft assumptions never alter household forecasts until Action Mode review and approval.</p>
      </div>
      {!readOnly && <span className="scenario-eyebrow"><i className="ti ti-shield-check"/> Review · Audit · Safe Undo</span>}
    </header>

    <p className="scenario-account-scope" role="note"><i className="ti ti-building-bank" aria-hidden="true"/><span><strong>Account scope: Operating Account</strong> Scenario Modeling uses the household operating-expense baseline. Renovation / Projects and Savings are intentionally excluded from these calculations.</span></p>

    {reviewError && <div className="scenario-expense-panel" role="alert">{reviewError}</div>}
    {reviewNotice && <div className="scenario-expense-panel" role="status">{reviewNotice}</div>}

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
        <span className="scenario-field-label">Monthly recurring expenses</span>
        <strong>{money.format(expense)} monthly</strong>
        <small>{model.expenseMode === 'operating' && liveOperatingExpense > 0 ? 'Live recurring expenses from the Operating Account' : 'Supplied scenario planning baseline'}</small>
      </div>
      <div className="scenario-expense-controls">
        <div className="scenario-segmented" aria-label="Expense source">
          <button type="button" disabled={readOnly || reviewBusy} className={model.expenseMode === 'scenario' ? 'is-active' : ''} onClick={() => reviewExpenseMode('scenario')}>Planning baseline</button>
          <button type="button" disabled={readOnly || reviewBusy || liveOperatingExpense <= 0} className={model.expenseMode === 'operating' ? 'is-active' : ''} onClick={() => reviewExpenseMode('operating')}>Live operating</button>
        </div>
        <div className="scenario-expense-controls"><label className="scenario-money-input"><span>$</span><input aria-label="Monthly recurring expense total draft" readOnly={readOnly} type="number" min="0" step="0.01" value={draftModel.planningExpense} onChange={event => updateModelDraft({ planningExpense:event.target.value })}/></label>{!readOnly&&<button type="button" className="scenario-add" disabled={reviewBusy || (Number(draftModel.planningExpense) === Number(model.planningExpense) && model.expenseMode === 'scenario')} onClick={reviewPlanningExpense}>Review expense total</button>}</div>
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
          <input className="scenario-title-input" aria-label="Scenario name draft" readOnly={readOnly} value={activeDraft.title} onChange={event => updateScenarioDraft({ title: event.target.value })}/>
          <input className="scenario-description-input" aria-label="Scenario description draft" readOnly={readOnly} value={activeDraft.description || ''} onChange={event => updateScenarioDraft({ description: event.target.value })}/>
        </div>
        {!readOnly && <button type="button" className="scenario-add" disabled={reviewBusy || (same(active?.title, activeDraft?.title) && same(active?.description || '', activeDraft?.description || ''))} onClick={reviewScenario}><i className="ti ti-shield-check"/> Review scenario details</button>}
      </div>

      <div className="scenario-income-tools">
        <p className="scenario-draft-guidance">Edit descriptions and assumptions, or add and remove income sources. Every shared change opens Action Mode review before it is applied.</p>
        {!readOnly && <button type="button" className="scenario-add" disabled={reviewBusy} onClick={addIncomeDraft}><i className="ti ti-plus"/> Add income source</button>}
      </div>

      <div className="scenario-table-wrap">
        <table className="scenario-table">
          <thead><tr><th>Description</th><th>Monthly net</th><th>Annual gross</th><th>Contribution</th><th>Work</th><th>Employment</th><th>Notes</th><th><span className="sr-only">Review</span></th></tr></thead>
          <tbody>{activeDraft.incomes.map((draftRow, rowIndex) => {
            const row=active.incomes.find(item=>item.id===draftRow.id)
            const label=String(draftRow.description || '').trim() || `Income source ${rowIndex + 1}`
            const rowChanged=!row||!same(changedFields(row,draftRow,incomeFields),{})
            return <tr key={draftRow.id}>
            <td><input className="scenario-income-description" aria-label={`Income ${rowIndex + 1} description draft`} readOnly={readOnly} value={draftRow.description || ''} placeholder="Income source name" onChange={event => updateIncomeDraft(draftRow.id, 'description', event.target.value)}/></td>
            <td><label className="scenario-cell-money"><span>$</span><input aria-label={`${label} monthly net draft`} readOnly={readOnly} type="number" min="0" step="0.01" value={draftRow.monthlyNet} onChange={event => updateIncomeDraft(draftRow.id, 'monthlyNet', event.target.value)}/></label></td>
            <td><label className="scenario-cell-money"><span>$</span><input aria-label={`${label} annual gross draft`} readOnly={readOnly} type="number" min="0" step="0.01" value={draftRow.annualGross} onChange={event => updateIncomeDraft(draftRow.id, 'annualGross', event.target.value)}/></label></td>
            <td><label className="scenario-cell-percent"><input aria-label={`${label} contribution draft`} readOnly={readOnly} type="number" min="0" step="1" value={draftRow.contribution} onChange={event => updateIncomeDraft(draftRow.id, 'contribution', event.target.value)}/><span>%</span></label></td>
            <td><button type="button" disabled={readOnly} className={`scenario-remote${draftRow.remote ? ' is-active' : ''}`} aria-pressed={draftRow.remote} onClick={() => updateIncomeDraft(draftRow.id, 'remote', !draftRow.remote)}>{draftRow.remote ? 'Remote' : 'On-site'}</button></td>
            <td><input aria-label={`${label} employment type draft`} readOnly={readOnly} value={draftRow.employment || ''} placeholder="Perm / Contract" onChange={event => updateIncomeDraft(draftRow.id, 'employment', event.target.value)}/></td>
            <td><input aria-label={`${label} notes draft`} readOnly={readOnly} value={draftRow.notes || ''} placeholder="Add note" onChange={event => updateIncomeDraft(draftRow.id, 'notes', event.target.value)}/></td>
            <td>{!readOnly && <div className="scenario-row-actions"><button type="button" className="scenario-add" disabled={reviewBusy||!rowChanged} aria-label={`${row ? 'Review changes to' : 'Review addition of'} ${label}`} onClick={() => reviewIncome(draftRow.id)}><i className="ti ti-shield-check"/><span>Review</span></button><button type="button" className="scenario-delete" disabled={reviewBusy} aria-label={`${row ? 'Review removal of' : 'Discard'} ${label}`} onClick={() => reviewRemoveIncome(draftRow.id)}><i className="ti ti-trash"/></button></div>}</td>
          </tr>})}</tbody>
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
