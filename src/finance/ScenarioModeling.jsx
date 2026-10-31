import {readScenarioWorkbook} from './scenarioWorkbookImport.js'
import { calculatePayoffProjection } from './scenarioProjection.js'
import FinanceExport from './FinanceExport.jsx'
import {financeReport} from './financeExportData.js'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { prepareDirectAction } from '../assistant/assistantApi.js'
import { requestActionReview } from '../assistant/actionEvents.js'
import { getAcknowledgedSharedStateVersion, SHARED_STATE_EVENT } from '../household/sharedState.js'
import {
  calculateScenario,
  updateIncomeAssumption,
  cloneDefaultScenarioModel,
  SCENARIO_STORAGE_KEY,
} from './scenarioModelingData.js'
import './ScenarioModeling.css'

const RecoveryWorkspace = lazy(() => import('./RecoveryWorkspace.jsx'))

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
      next = next==null ? null : Number(next)
      if (next!=null && !Number.isFinite(next)) throw new Error(`${field.replace(/([A-Z])/g, ' $1').toLowerCase()} must be a valid number.`)
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

export default function ScenarioModeling({ liveOperatingExpense = 0, readOnly = false, financeData, actuals, debts, freshness }) {
  const initialModel = useMemo(() => loadModel(), [])
  const [model, setModel] = useState(initialModel)
  const [draftModel, setDraftModel] = useState(() => clone(initialModel))
  const [activeId, setActiveId] = useState(() => initialModel.scenarios[0]?.id || 'current')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [importDraft,setImportDraft]=useState(null)
  const [importBusy,setImportBusy]=useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewNotice, setReviewNotice] = useState('')
  const favorites = model.scenarios.filter(scenario => scenario.favorite === true)
  const visibleScenarios = favoritesOnly ? favorites : model.scenarios
  const selectedId = visibleScenarios.some(scenario => scenario.id === activeId) ? activeId : visibleScenarios[0]?.id
  const activeIndex = Math.max(0, model.scenarios.findIndex(scenario => scenario.id === selectedId))
  const active = model.scenarios[activeIndex]
  const activeDraft = draftModel.scenarios.find(scenario => scenario.id === active?.id) || active
  const expense = model.expenseMode === 'operating' && liveOperatingExpense > 0
    ? liveOperatingExpense
    : Number(activeDraft?.planningExpense ?? draftModel.planningExpense) || 0
  const result = useMemo(() => calculateScenario(activeDraft, expense), [activeDraft, expense])

  const payoff = useMemo(() => calculatePayoffProjection(activeDraft?.source, result.monthlyCashFlow), [activeDraft?.source, result.monthlyCashFlow])

  useEffect(() => {
    const refresh = event => {
      if (event?.type === 'storage' && event.key && event.key !== SCENARIO_STORAGE_KEY) return
      if (event?.type === SHARED_STATE_EVENT && event.detail?.keys?.length && !event.detail.keys.includes(SCENARIO_STORAGE_KEY)) return
      const next = loadModel()
      setModel(next)
      setImportDraft(null)
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
        incomes:scenario.incomes.map(row => row.id === incomeId ? updateIncomeAssumption(row, field, value, active.incomes.find(item => item.id === incomeId) || row) : row),
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
    const planningExpense = Number(activeDraft.planningExpense ?? draftModel.planningExpense)
    if (!Number.isFinite(planningExpense) || planningExpense < 0) {
      setReviewError('Monthly planning expense must be a non-negative number.')
      return
    }
    if (planningExpense === Number(active.planningExpense ?? model.planningExpense) && model.expenseMode === 'scenario') return
    const payload = { planningExpense }
    if (model.expenseMode !== 'scenario') { setReviewError('Choose Planning baseline before reviewing this scenario expense.'); return }
    void openReview({
      summary:'Update total monthly recurring expenses in Scenario Modeling',
      operation:{
        type:'forecast.update', targetId:active.id, payload,
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

  return <section className="scenario-page" aria-labelledby="scenario-title"><FinanceExport report={financeReport(`Scenario ${active.name||active.title||active.id}`,{assumptions:activeDraft,operatingExpense:expense,result,calculatedPayoff:payoff,draft:!same(active,activeDraft)},['Calculated scenario preview; unsaved assumptions require approval. Does not change bank balances.'])}/>
    <header className="scenario-header">
      <div>
        <p className="scenario-eyebrow">Finance · Forward planning</p>
        <h1 id="scenario-title">Cashflow Scenarios</h1>
        <p>Compare household income paths against recurring operating expenses. Draft assumptions never alter household forecasts until Action Mode review and approval.</p>
      </div>
      {!readOnly && <span className="scenario-eyebrow"><i className="ti ti-shield-check"/> Review · Audit · Safe Undo</span>}
    </header>

    {!readOnly&&<details className="scenario-expense-panel scenario-import"><summary>Import scenarios from Excel</summary><p>Read the Scenarios tab, then review all income assumptions and saved payoff schedules before replacing the existing income scenarios. Recovery plans are preserved.</p><input type="file" accept=".xlsx" aria-label="Import scenario workbook" disabled={importBusy||reviewBusy} onChange={async event=>{const file=event.target.files?.[0];if(!file)return;setImportBusy(true);setReviewError('');try{setImportDraft(await readScenarioWorkbook(file))}catch(error){setReviewError(error.message)}finally{setImportBusy(false);event.target.value=''}}}/>{importBusy&&<p role="status">Reading Scenarios tab…</p>}{importDraft&&<div><p>{importDraft.scenarios.length} scenarios ready from {importDraft.filename}.</p><ul>{importDraft.scenarios.map(s=><li key={s.id}>{s.title} · {s.incomes.length} income sources · {money.format(s.source.summary.monthlyCashFlow)} monthly cashflow</li>)}</ul><button className="scenario-add" disabled={reviewBusy} onClick={()=>openReview({summary:`Import ${importDraft.scenarios.length} scenarios from ${importDraft.filename}`,operation:{type:'forecast.update',targetId:'model',payload:{scenarioImportJson:JSON.stringify(importDraft)},description:'Replace the income scenarios with the reviewed workbook cases, including their individual expense baselines and saved payoff schedules. Preserve recovery plans and retain the previous model for Undo.'}})}>Review scenario import</button></div>}</details>}
    <h2>Existing income scenarios</h2>
    <p className="scenario-account-scope" role="note"><i className="ti ti-building-bank" aria-hidden="true"/><span><strong>Account scope: Operating Account</strong> Scenario Modeling uses the household operating-expense baseline. Renovation / Projects and Savings are intentionally excluded from these calculations.</span></p>

    {reviewError && <div className="scenario-expense-panel" role="alert">{reviewError}</div>}
    {reviewNotice && <div className="scenario-expense-panel" role="status">{reviewNotice}</div>}

    <div className="scenario-segmented scenario-filters" aria-label="Scenario filter">
      <button aria-pressed={!favoritesOnly} className={!favoritesOnly?'is-active':''} onClick={()=>setFavoritesOnly(false)}>All scenarios ({model.scenarios.length})</button>
      <button aria-pressed={favoritesOnly} className={favoritesOnly?'is-active':''} onClick={()=>setFavoritesOnly(true)}>★ Favorites ({favorites.length})</button>
    </div>
    {favoritesOnly&&!favorites.length&&<p role="status">No favorite scenarios yet. Choose All scenarios and star a scenario to save it here.</p>}
    <div className="scenario-tabs" role="tablist" aria-label="Financial scenarios">
      {visibleScenarios.map(scenario => {
        const summary = calculateScenario(draftModel.scenarios.find(item => item.id === scenario.id) || scenario, model.expenseMode==='operating'?expense:(draftModel.scenarios.find(item => item.id === scenario.id)?.planningExpense ?? scenario.planningExpense ?? draftModel.planningExpense))
        const selected = scenario.id === active.id
        return <div className="scenario-choice" key={scenario.id} role="presentation"><button type="button" role="tab" aria-selected={selected} className={selected ? 'is-active' : ''} onClick={() => setActiveId(scenario.id)}>
          <span>{scenario.title}</span>
          <strong className={summary.monthlyCashFlow >= 0 ? 'positive' : 'negative'}>{money.format(summary.monthlyCashFlow)} / month</strong>
        </button><button type="button" className="scenario-star" aria-label={`${scenario.favorite?'Remove':'Add'} ${scenario.title} ${scenario.favorite?'from':'to'} favorites`} aria-pressed={scenario.favorite===true} disabled={readOnly||reviewBusy} onClick={()=>openReview({summary:`${scenario.favorite?'Remove':'Add'} ${quote(scenario.title)} ${scenario.favorite?'from':'to'} favorites`,operation:{type:'forecast.update',targetId:scenario.id,payload:{favorite:!scenario.favorite},description:'Update the shared scenario favorite. Financial assumptions and payoff schedules stay unchanged.'}})}>{scenario.favorite?'★':'☆'}</button></div>
      })}
    </div>

    {visibleScenarios.length>0&&<>
    <div className="scenario-expense-panel">
      <div>
        <span className="scenario-field-label">Monthly recurring expenses</span>
        <strong>{money.format(expense)} monthly</strong>
        <small>{model.expenseMode === 'operating' && liveOperatingExpense > 0 ? 'Live recurring expenses from the Operating Account' : active.source ? 'Workbook baseline for this scenario' : 'Supplied scenario planning baseline'}</small>
      </div>
      <div className="scenario-expense-controls">
        <div className="scenario-segmented" aria-label="Expense source">
          <button type="button" disabled={readOnly || reviewBusy} className={model.expenseMode === 'scenario' ? 'is-active' : ''} onClick={() => reviewExpenseMode('scenario')}>Planning baseline</button>
          <button type="button" disabled={readOnly || reviewBusy || liveOperatingExpense <= 0} className={model.expenseMode === 'operating' ? 'is-active' : ''} onClick={() => reviewExpenseMode('operating')}>Live operating</button>
        </div>
        <div className="scenario-expense-controls" ><label className="scenario-money-input"><span>$</span><input aria-label="Monthly recurring expense total draft" readOnly={readOnly} type="number" min="0" step="0.01" value={activeDraft.planningExpense ?? draftModel.planningExpense} onChange={event => updateScenarioDraft({ planningExpense:event.target.value })}/></label>{!readOnly&&<button type="button" className="scenario-add" disabled={reviewBusy || (Number(draftModel.planningExpense) === Number(active.planningExpense ?? model.planningExpense) && model.expenseMode === 'scenario')} onClick={reviewPlanningExpense}>Review expense total</button>}</div>
      </div>
    </div>

    <p className="scenario-draft-guidance">Live calculation preview. Changes are saved only after review and approval.</p>
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
        <p className="scenario-draft-guidance">Calculated preview updates immediately. Edit net pay directly, or change annual gross to estimate net using the displayed take-home ratio. This is not a tax calculation. Income shares and totals are calculated. Review and approve to save assumptions.</p>
        {!readOnly && <button type="button" className="scenario-add" disabled={reviewBusy} onClick={addIncomeDraft}><i className="ti ti-plus"/> Add income source</button>}
      </div>

      <div className="scenario-table-wrap">
        <table className="scenario-table">
          <thead><tr><th>Description</th><th>Monthly net</th><th>Annual gross</th><th>Income share (net)</th><th>Work</th><th>Employment</th><th>Notes</th><th><span className="sr-only">Review</span></th></tr></thead>
          <tbody>{activeDraft.incomes.map((draftRow, rowIndex) => {
            const row=active.incomes.find(item=>item.id===draftRow.id)
            const label=String(draftRow.description || '').trim() || `Income source ${rowIndex + 1}`
            const rowChanged=!row||!same(changedFields(row,draftRow,incomeFields),{})
            return <tr key={draftRow.id}>
            <td><input className="scenario-income-description" aria-label={`Income ${rowIndex + 1} description draft`} readOnly={readOnly} value={draftRow.description || ''} placeholder="Income source name" onChange={event => updateIncomeDraft(draftRow.id, 'description', event.target.value)}/></td>
            <td><label className="scenario-cell-money"><span>$</span><input aria-label={`${label} monthly net draft`} readOnly={readOnly} type="number" min="0" step="0.01" value={draftRow.monthlyNet??''} onChange={event => updateIncomeDraft(draftRow.id, 'monthlyNet', event.target.value)}/></label></td>
            <td><label className="scenario-cell-money"><span>$</span><input aria-label={`${label} annual gross draft`} readOnly={readOnly} type="number" min="0" step="0.01" value={draftRow.annualGross??''} onChange={event => updateIncomeDraft(draftRow.id, 'annualGross', event.target.value)}/></label></td>
            <td><output aria-label={`${label} calculated income share`}>{result.monthlyNetIncome > 0 ? ((Number(draftRow.monthlyNet) || 0) / result.monthlyNetIncome * 100).toFixed(2) : '0.00'}%</output><small>{Number(draftRow.annualGross) > 0 ? `Take-home ratio: ${(Number(draftRow.monthlyNet) * 1200 / Number(draftRow.annualGross)).toFixed(2)}%` : 'Enter gross and net to establish a take-home ratio.'}</small></td>
            <td><button type="button" disabled={readOnly} className={`scenario-remote${draftRow.remote ? ' is-active' : ''}`} aria-pressed={draftRow.remote} onClick={() => updateIncomeDraft(draftRow.id, 'remote', !draftRow.remote)}>{draftRow.remote==null ? (draftRow.workArrangement||'Unconfirmed') : draftRow.remote ? 'Remote' : 'On-site'}</button></td>
            <td><input aria-label={`${label} employment type draft`} readOnly={readOnly} value={draftRow.employment || ''} placeholder="Perm / Contract" onChange={event => updateIncomeDraft(draftRow.id, 'employment', event.target.value)}/></td>
            <td><input aria-label={`${label} notes draft`} readOnly={readOnly} value={draftRow.notes || ''} placeholder="Add note" onChange={event => updateIncomeDraft(draftRow.id, 'notes', event.target.value)}/></td>
            <td>{!readOnly && <div className="scenario-row-actions"><button type="button" className="scenario-add" disabled={reviewBusy||!rowChanged} aria-label={`${row ? 'Review changes to' : 'Review addition of'} ${label}`} onClick={() => reviewIncome(draftRow.id)}><i className="ti ti-shield-check"/><span>Review</span></button><button type="button" className="scenario-delete" disabled={reviewBusy} aria-label={`${row ? 'Review removal of' : 'Discard'} ${label}`} onClick={() => reviewRemoveIncome(draftRow.id)}><i className="ti ti-trash"/></button></div>}</td>
          </tr>})}</tbody>
          <tfoot><tr><th>Total</th><th>{money.format(result.monthlyNetIncome)}</th><th>{money.format(result.annualGrossIncome)}</th><th>{result.contribution}%</th><th colSpan="4"/></tr></tfoot>
        </table>
      </div>
    </section>

    {active.source && <section className="scenario-projections" aria-label="Calculated payoff schedule">
      <h2>Calculated payoff plan</h2>
      <p>Recalculates from the income and expense assumptions above. Opening cash, reserve, liabilities, payment releases, and annual taxes come from the imported workbook. Payments follow the listed order, preserve the reserve and future annual tax coverage, and release monthly expenses starting the following month. No debt interest is assumed.</p>
      {payoff.error ? <p role="alert">{payoff.error}</p> : <>
        <div className="scenario-summary"><SummaryMetric label="Listed debts paid by" value={payoff.payoff}/><SummaryMetric label="Lowest modeled cash" value={money.format(payoff.minimumCash)}/><SummaryMetric label="Unpaid listed liabilities" value={money.format(payoff.unpaid)}/><SummaryMetric label="Ending modeled cash" value={money.format(payoff.endingCash)}/></div>
        <details><summary>Calculation assumptions</summary><ul>{active.source.notes.filter(n => !n.includes('Contribution percentages are retained')).map((n,i)=><li key={i}>{n}</li>)}</ul><p>Total modeled payments: {money.format(payoff.totalPaid)}. Includes annual taxes and listed debt payoffs.</p></details>
        <details><summary>Calculated cashflow and payoff schedule · {payoff.schedule.length} entries</summary><div className="scenario-table-wrap"><table className="scenario-table"><thead><tr><th>Month</th><th>Item</th><th>Amount</th><th>Balance</th><th>Calculation</th></tr></thead><tbody>{payoff.schedule.map((r,i)=><tr key={i}><td>{r[0].slice(0,7)}</td><td>{r[1]}</td><td>{money.format(r[2])}</td><td>{money.format(r[3])}</td><td>{r[4]}</td></tr>)}</tbody></table></div></details>
      </>}
    </section>}

    <section className="scenario-projections">
      <div className="scenario-section-heading">
        <div><p className="scenario-eyebrow">Cumulative projection</p><h2>Cash flow over time</h2></div>
        <p>Baseline cashflow only: assumes constant income and recurring expenses. Excludes opening cash, annual taxes, and debt payoffs shown in the calculated payoff plan.</p>
      </div>
      <div className="scenario-projection-grid">
        <div><span>1 year</span><strong>{wholeMoney.format(result.annualCashFlow)}</strong></div>
        {[2, 3, 4, 5].map(year => <div key={year}><span>{year} years</span><strong>{wholeMoney.format(result.projections[year])}</strong></div>)}
      </div>
    </section>
    </>}
    <Suspense fallback={<p>Loading recovery scenarios…</p>}><RecoveryWorkspace financeData={financeData} actuals={actuals} debts={debts} freshness={freshness} readOnly={readOnly} /></Suspense>
  </section>
}
