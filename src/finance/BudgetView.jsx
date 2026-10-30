import CategoryBudgetSummary from './CategoryBudgetSummary.jsx'
import './SpendingReview.css'
import {Fragment,useState,useEffect,useMemo} from 'react'
import FinanceExport from './FinanceExport.jsx'
import {recordsSection} from './financeExportData.js'
import {fmtMoney} from './projection.js'
import {consolidateBudgetLines,allocateBudgetActuals,budgetTargetForLine,buildBudgetBreakdown,buildBudgetCategoryLines,buildLegacyBudgetOwners,budgetBreakdownTotal} from './budgetBreakdown.js'
import {calculateTransactionAmountForMonth} from './monthlyCashFlow.js'
import {SHARED_STATE_EVENT} from '../household/sharedState.js'
import {getHouseholdCalendarDate} from './financeTime.js'
import {buildUniquePlaidAccountMap} from './calendarSemantics.js'
const BUDGET_LS_KEY = 'lslj_budget_v1'
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function loadBudget() {
  try { return JSON.parse(localStorage.getItem(BUDGET_LS_KEY)) || {} } catch { return {} }
}

export default function BudgetView({ vendorOrder='', freshnessMessage='', unmappedActuals=[], includesUnmapped=false, data, plaidActuals = [], legacyAccountId = '', initialMonth, onOpenTransactions, onOpenRecurring, onReviewBudgetChange, onReview, readOnly = false }) {
  const [budget, setBudget] = useState(loadBudget)
  const [period, setPeriod] = useState('monthly') // monthly | annual
  const [expanded, setExpanded] = useState({ Income: true })
  const [editCell, setEditCell] = useState(null) // { cat, item, month }
  const [mode, setMode] = useState('monthly-view') // 'monthly-view' | 'plan'
  const initialBudgetDate = /^\d{4}-\d{2}$/.test(String(initialMonth || ''))
    ? new Date(Number(initialMonth.slice(0, 4)), Number(initialMonth.slice(5, 7)) - 1, 1)
    : getHouseholdCalendarDate()
  const [selMonth, setSelMonth] = useState(initialBudgetDate.getMonth())
  const [selYear, setSelYear] = useState(initialBudgetDate.getFullYear())
  useEffect(() => {
    if (readOnly) {
      setEditCell(null)
    }
  }, [readOnly])
  useEffect(() => {
    const refreshBudget = event => {
      const key = event?.detail?.key || event?.key
      if (!key || key === BUDGET_LS_KEY) setBudget(loadBudget())
    }
    window.addEventListener(SHARED_STATE_EVENT, refreshBudget)
    window.addEventListener('storage', refreshBudget)
    return () => {
      window.removeEventListener(SHARED_STATE_EVENT, refreshBudget)
      window.removeEventListener('storage', refreshBudget)
    }
  }, [])

  const legacyYear = getHouseholdCalendarDate().getFullYear()
  const budgetAccountIds = useMemo(() => new Set(data.accounts.map(account => String(account.id))), [data.accounts])
  const BUDGET_CATS = useMemo(
    () => buildBudgetCategoryLines(data.transactions, budget, { accountIds:budgetAccountIds, vendorOrder }),
    [data.transactions, budget, budgetAccountIds,vendorOrder],
  )
  const budgetLines = useMemo(() => Object.values(BUDGET_CATS).flat(), [BUDGET_CATS])
  const legacyOwners = useMemo(() => buildLegacyBudgetOwners(budgetLines), [budgetLines])

  const monthKey = `${selYear}-${String(selMonth + 1).padStart(2, '0')}`
  const monthFrom = `${monthKey}-01`
  const monthTo = `${monthKey}-${String(new Date(selYear, selMonth + 1, 0).getDate()).padStart(2, '0')}`
  const unmappedMonthCount = unmappedActuals.filter(tx => String(tx.date || '').startsWith(monthKey) && !tx.pending).length
  const selectedMonthActuals = useMemo(
    () => plaidActuals.filter(tx => String(tx.date || '').startsWith(monthKey)),
    [plaidActuals, monthKey],
  )
  const actualAllocation = useMemo(() => allocateBudgetActuals(selectedMonthActuals, budgetLines, buildUniquePlaidAccountMap(data.accounts)), [selectedMonthActuals, budgetLines, data.accounts])
  const syncedActualsByCategory = actualAllocation.byCategory
  const DISPLAY_BUDGET_CATS = useMemo(() => {
    const result = { ...BUDGET_CATS }
    for(const entry of Object.values(budget.categoryLimits||{})){if(entry.month===monthKey&&budgetAccountIds.has(entry.accountId)&&!result[entry.category])result[entry.category]=[]}
    Object.keys(syncedActualsByCategory).forEach(category => {
      if (!result[category]) result[category] = []
    })
    return result
  }, [BUDGET_CATS, syncedActualsByCategory,budget,monthKey,budgetAccountIds])

  // Reviewed targets take precedence; schedules supply the default.
  const getBudgeted = (line, month = selMonth, year = selYear) => {
    const planVal = budgetTargetForLine({ budget, line, year, month, legacyYear, legacyAccountId, legacyOwners })
    if (planVal !== undefined && planVal !== null && planVal !== '') return Number(planVal) || 0
    const monthDate = new Date(year, month, 1)
    return line.transactions.reduce((total, transaction) => total + calculateTransactionAmountForMonth(transaction, monthDate), 0)
  }

  const catBudgeted = cat => data.accounts.reduce((sum,account)=>{const explicit=Object.values(budget.categoryLimits||{}).find(e=>e.accountId===account.id&&e.month===monthKey&&e.category===cat);return sum+(explicit?explicit.amount:(BUDGET_CATS[cat]||[]).filter(l=>l.accountId===account.id).reduce((s,l)=>s+getBudgeted(l),0))},0)
  const lineActual = line => actualAllocation.byLine[line.id] || 0
  const catActual = cat => syncedActualsByCategory[cat] || 0

  const totalBudget  = Object.keys(DISPLAY_BUDGET_CATS).filter(c => c !== 'Income').reduce((s, c) => s + catBudgeted(c), 0)
  const totalActual  = Object.entries(syncedActualsByCategory).filter(([category]) => category !== 'Income').reduce((sum, [, amount]) => sum + amount, 0)
  const totalIncomeBudget = catBudgeted('Income')
  const totalIncomeActual = catActual('Income')
  const openBudgetBreakdown = (direction) => {
    const month = new Date(selYear, selMonth, 1)
    const breakdownLines = buildBudgetBreakdown({ transactions:data.transactions, budget, month, direction, legacyYear, legacyAccountId, accountIds:budgetAccountIds, useTargets:true })
    onOpenRecurring?.({
      direction,
      budgetLines:breakdownLines,
      budgetMonth: monthKey,
      budgetPeriodLabel: `${MONTHS[selMonth]} ${selYear}`,
      budgetTotal: budgetBreakdownTotal(breakdownLines),
      label: `${direction === 'income' ? 'Budgeted income' : 'Budgeted expenses'} · ${MONTHS[selMonth]} ${selYear}`,
    })
  }

  const consolidated = cat => consolidateBudgetLines(BUDGET_CATS[cat]||[],getBudgeted,lineActual)
  const exportRows=Object.keys(DISPLAY_BUDGET_CATS).flatMap(cat=>[
    ...consolidated(cat).map(row=>({group:cat,category:row.name,direction:cat==='Income'?'Income':'Expense',budget:row.budget,actual:row.actual,variance:row.budget-row.actual})),
    ...(actualAllocation.unallocatedByCategory[cat]?[{group:cat,category:'Unallocated bank activity',direction:cat==='Income'?'Income':'Expense',budget:0,actual:actualAllocation.unallocatedByCategory[cat],variance:-actualAllocation.unallocatedByCategory[cat]}]:[])
  ])
  if (mode === 'monthly-view') {
    const expenseCats = Object.entries(DISPLAY_BUDGET_CATS)
    return (
      <div>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--white)' }}>Monthly Budget</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>Reviewed monthly targets, with scheduled income and expenses as defaults. Use Plan Grid to adjust targets.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Month nav */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '4px 12px' }}>
              <button aria-label="Previous budget month" onClick={() => { const d = new Date(selYear, selMonth - 1); setSelMonth(d.getMonth()); setSelYear(d.getFullYear()) }}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>‹</button>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)', minWidth: 100, textAlign: 'center' }}>
                {MONTHS[selMonth]} {selYear}
              </span>
              <button aria-label="Next budget month" onClick={() => { const d = new Date(selYear, selMonth + 1); setSelMonth(d.getMonth()); setSelYear(d.getFullYear()) }}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>›</button>
            </div>
            <button onClick={() => setMode('plan')}
              style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', color: 'var(--muted)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)' }}>
              Plan Grid →
            </button>
          </div>
        </div>

        <FinanceExport report={{title:`Budget ${monthKey}`,notes:[`${monthFrom} through ${monthTo}`,`Accounts: ${data.accounts.map(a=>a.name).join(', ')}`,freshnessMessage,'Actuals include posted activity only. Variance = Budget minus Actual.'],sections:[recordsSection('Consolidated categories',exportRows,['group','category','direction','budget','actual','variance']),recordsSection('Group totals',Object.keys(DISPLAY_BUDGET_CATS).map(cat=>({group:cat,budget:catBudgeted(cat),actual:catActual(cat)})))]}} />
        <CategoryBudgetSummary accounts={data.accounts} scheduled={data.transactions} actuals={plaidActuals} budget={budget} month={monthKey} legacyYear={legacyYear} legacyAccountId={legacyAccountId} onReview={onReview} readOnly={readOnly}/>
        {/* Summary cards */}
        <div className="finance-budget-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          {[
            { label: 'Income Budgeted',  val: totalIncomeBudget, color: 'var(--gold)' },
            { label: 'Income Actual',    val: totalIncomeActual, color: 'var(--income-color)' },
            { label: 'Expenses Budgeted', val: totalBudget,      color: 'var(--muted)' },
            { label: 'Expenses Actual',   val: totalActual,      color: totalActual > totalBudget ? 'var(--expense-color)' : 'var(--income-color)' },
          ].map(({ label, val, color }) => {
            const actual = label.endsWith('Actual')
            const direction = label.startsWith('Income') ? 'income' : 'expense'
            const open = actual
              ? () => onOpenTransactions?.({ direction, postedOnly:true, dateFrom: monthFrom, dateTo: monthTo, budgetMonth: monthKey, label: `${label} · ${MONTHS[selMonth]} ${selYear}` })
              : () => openBudgetBreakdown(direction)
            return <div key={label} role="button" tabIndex={0} title={actual?'Open matching transactions':'Open budget lines'} onClick={open} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') open?.() }} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(197,164,109,0.14)', borderRadius: 14, padding: '16px 20px', backdropFilter: 'blur(20px)', cursor: 'pointer' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 300, fontFamily: 'var(--font-serif)', color }}>{fmtMoney(val)}</div>
            </div>
          })}
        </div>

        <p role="status" style={{fontSize:12,color:'var(--muted)',lineHeight:1.6}}>{freshnessMessage}</p>
        {unmappedMonthCount > 0 && <p role="status" style={{fontSize:12,color:'var(--gold)',lineHeight:1.6}}>{unmappedMonthCount} posted bank entries this month have no confirmed account mapping. {includesUnmapped ? 'All includes their non-transfer activity in these totals.' : 'They are excluded from this account selection; choose All to include their non-transfer activity.'} Review Finance → Accounts to map sources by their bank IDs.</p>}
        <p style={{fontSize:12,color:'var(--muted)',lineHeight:1.6}}>Actuals include all posted non-transfer bank activity for the selected accounts and month. Income Actual includes credits, refunds, and uncategorized deposits. Pending activity and account transfers are excluded. Bank activity without a reviewed link to a scheduled record remains included in actual totals.</p>

        {/* Overall expense progress */}
        {totalBudget > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Total Expense Budget Used</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: totalActual > totalBudget ? 'var(--expense-color)' : 'var(--income-color)' }}>
                {totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0}%
              </span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min((totalActual / totalBudget) * 100, 100)}%`, background: totalActual > totalBudget ? 'var(--expense-color)' : 'var(--gold)', borderRadius: 99, transition: 'width 0.4s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
              <span>{fmtMoney(totalActual)} spent</span>
              <span>{fmtMoney(Math.max(totalBudget - totalActual, 0))} remaining</span>
            </div>
          </div>
        )}

        {/* Category rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {expenseCats.map(([cat, lines]) => {
            const budgeted = catBudgeted(cat)
            const actual   = catActual(cat)
            const pct      = budgeted > 0 ? Math.min((actual / budgeted) * 100, 100) : actual > 0 ? 100 : 0
            const over     = cat!=='Uncategorized' && actual > budgeted
            const unallocated = actualAllocation.unallocatedByCategory[cat] || 0
            const isOpen   = expanded[cat] !== false
            return (
              <div key={cat} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${over ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 14, overflow: 'hidden' }}>
                {/* Category header */}
                <div className="finance-budget-category-header" onClick={() => setExpanded(p => ({ ...p, [cat]: !isOpen }))}
                  style={{ padding: '14px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <i className={`ti ${isOpen ? 'ti-chevron-down' : 'ti-chevron-right'}`} style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)', flex: 1 }}>{cat}</span>
                  <div className="finance-budget-category-metrics" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 120, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: over ? 'var(--expense-color)' : pct > 80 ? '#fbbf24' : 'var(--gold)', borderRadius: 99, transition: 'width 0.4s' }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: over ? 'var(--expense-color)' : 'var(--muted)', minWidth: 60, textAlign: 'right' }}>{cat==='Uncategorized'?'Needs category':budgeted > 0 ? `${Math.round(pct)}%` : actual > 0 ? 'Unbudgeted' : '—'}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 80, textAlign: 'right' }}>Actual {fmtMoney(actual)} / Budget {fmtMoney(budgeted)}</span>
                  </div>
                </div>
                {/* Line items */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {consolidated(cat).map(line => {
                      const b = line.budget
                      const a = line.actual
                      const p = b > 0 ? Math.min((a / b) * 100, 100) : 0
                      const ov = a > b && b > 0
                      return (
                        <div className="finance-budget-line" key={line.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px 10px 40px', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                          <span className="finance-budget-line-name" style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>{line.name}</span>
                          <div className="finance-budget-line-meter" style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ height: '100%', width: `${p}%`, background: ov ? 'var(--expense-color)' : p > 80 ? '#fbbf24' : 'var(--gold)', borderRadius: 99 }} />
                          </div>
                          <span className="finance-budget-line-percent" style={{ fontSize: 11, color: 'var(--muted)', minWidth: 32, textAlign: 'right' }}>{Math.round(p)}%</span>
                          <div
                            className="finance-budget-line-actual"
                            data-label="Actual"
                            title="Calculated from posted bank activity; pending transactions are excluded"
                            style={{ width: 80, textAlign: 'right', fontSize: 12, padding: '3px 8px', borderRadius: 6,
                              color: a ? (ov ? 'var(--expense-color)' : 'var(--white)') : 'rgba(255,255,255,0.2)',
                              border: '1px solid transparent' }}>
                            {fmtMoney(a)}
                          </div>
                          <span className="finance-budget-line-budget" data-label="Budget" style={{ fontSize: 12, color: 'var(--muted)', minWidth: 80, textAlign: 'right' }}>{fmtMoney(b)}</span>
                        </div>
                      )
                    })}
                    {unallocated > 0 && (
                      <div className="finance-budget-line" style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 20px 10px 40px', borderTop:'1px solid rgba(255,255,255,0.03)' }}>
                        <span className="finance-budget-line-name" style={{ fontSize:12, color:'var(--gold)', flex:1 }}>Unallocated bank activity <small style={{ display:'block', color:'var(--muted)', marginTop:2 }}>Included in actual totals; no reviewed link to a scheduled record.</small></span>
                        <span className="finance-budget-line-meter" style={{ width:80 }} />
                        <span className="finance-budget-line-percent" style={{ minWidth:32 }} />
                        <span className="finance-budget-line-actual" data-label="Actual" title="Actual transactions that do not map uniquely to one budget line" style={{ width:80, textAlign:'right', fontSize:12, color:'var(--white)' }}>{fmtMoney(unallocated)}</span>
                        <span className="finance-budget-line-budget" data-label="Budget" style={{ minWidth:80, textAlign:'right', fontSize:12, color:'var(--muted)' }}>—</span>
                      </div>
                    )}
                    <div className="finance-budget-category-total" style={{ display: 'flex', padding: '8px 20px 10px 40px', borderTop: '1px solid rgba(255,255,255,0.05)', gap: 12 }}>
                      <span className="finance-budget-category-total-label" style={{ flex: 1, fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Category Total</span>
                      <span className="finance-budget-category-total-actual" style={{ fontSize: 12, fontWeight: 700, color: over ? 'var(--expense-color)' : 'var(--income-color)', minWidth: 80, textAlign: 'right' }}>{fmtMoney(actual)}</span>
                      <span className="finance-budget-category-total-budget" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', minWidth: 80, textAlign: 'right' }}>{fmtMoney(budgeted)}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p style={{ marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>{readOnly ? 'Posted actual and budget amounts are visible here; the household administrator manages corrections and targets.' : 'Actuals are calculated from posted bank activity and cannot be overwritten manually · pending transactions are excluded · budgeted amounts use reviewed targets or scheduled occurrences · use Plan Grid for reviewed target changes'}</p>
      </div>
    )
  }

  // ── PLAN MODE (existing grid) ──

  const getCellVal = (line, month) => getBudgeted(line, month, selYear)

  const reviewCellVal = async (line, month, val) => {
    if (readOnly) return false
    const num = parseFloat(val) || 0
    await onReviewBudgetChange?.({ line, year:selYear, month, value:num })
    return true
  }

  const annualTotal = (line) => {
    return MONTHS.reduce((sum, _, month) => sum + getBudgeted(line, month, selYear), 0)
  }

  const catTotal = (cat, month) => {
    return (BUDGET_CATS[cat] || []).reduce((s, line) => {
      const v = month === 'annual'
        ? annualTotal(line)
        : parseFloat(getCellVal(line, month) || 0)
      return s + v
    }, 0)
  }

  const incomeTotal = (month) => catTotal('Income', month)
  const expenseTotal = (month) => Object.entries(BUDGET_CATS)
    .filter(([cat]) => cat !== 'Income')
    .reduce((s, [cat]) => s + catTotal(cat, month), 0)
  const netTotal = (month) => incomeTotal(month) - expenseTotal(month)

  const colStyle = { width: period === 'monthly' ? 72 : 100, minWidth: period === 'monthly' ? 72 : 100, textAlign: 'right', padding: '0 4px' }
  const hdrStyle = { ...colStyle, fontSize: 10, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', paddingBottom: 8 }

  return (
    <div>
      {/* Header */}
      <div className="finance-budget-plan-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--white)' }}>Budget Plan · {selYear}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>Review monthly targets by stable record · unreviewed values follow all scheduled occurrences · annual totals update automatically</p>
        </div>
        <div className="finance-budget-plan-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => setMode('monthly-view')}
            style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(197,164,109,0.3)', background: 'rgba(197,164,109,0.08)', color: 'var(--gold)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            ← Monthly View
          </button>
          <div style={{ display: 'flex', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            {['monthly','annual'].map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                style={{ padding: '7px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', fontFamily: 'var(--font)',
                  background: period === p ? 'rgba(197,164,109,0.15)' : 'transparent',
                  color: period === p ? 'var(--gold)' : 'var(--muted)' }}>
                {p === 'monthly' ? 'Monthly' : 'Annual'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <FinanceExport report={{title:`Budget Plan ${selYear}`,notes:[`Accounts: ${data.accounts.map(a=>a.name).join(', ')}`,'Individual reviewed target records; totals include all scheduled occurrences.'],sections:[recordsSection('Annual plan',budgetLines.map(line=>({group:line.category,category:line.name,account:line.accountId,...Object.fromEntries(MONTHS.map((m,i)=>[m,getBudgeted(line,i,selYear)])),total:annualTotal(line)})))]}}/>
      <CategoryBudgetSummary accounts={data.accounts} scheduled={data.transactions} actuals={plaidActuals} budget={budget} month={monthKey} legacyYear={legacyYear} legacyAccountId={legacyAccountId} onReview={onReview} readOnly={readOnly}/>
      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: period === 'monthly' ? 1100 : 500 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 10, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', width: 200 }}>Category</th>
              {period === 'monthly'
                ? MONTHS.map(m => <th key={m} style={hdrStyle}>{m}</th>)
                : <th style={hdrStyle}>Annual</th>}
              <th style={{ ...hdrStyle, color: 'var(--gold)' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(BUDGET_CATS).map(([cat, lines]) => {
              const isIncome = cat === 'Income'
              const isOpen = expanded[cat]
              return (
                <Fragment key={cat}>
                  <tr onClick={() => setExpanded(p => ({ ...p, [cat]: !p[cat] }))}
                    style={{ cursor: 'pointer', background: isIncome ? 'rgba(197,164,109,0.06)' : 'rgba(255,255,255,0.025)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 16px', fontSize: 12, fontWeight: 700, color: isIncome ? 'var(--gold)' : 'var(--soft-white)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className={`ti ${isOpen ? 'ti-chevron-down' : 'ti-chevron-right'}`} style={{ fontSize: 11, opacity: 0.6 }} />
                        {cat}
                      </span>
                    </td>
                    {period === 'monthly'
                      ? MONTHS.map((_, mi) => <td key={mi} style={{ ...colStyle, fontSize: 12, fontWeight: 600, color: isIncome ? 'var(--gold)' : 'var(--soft-white)', padding: '10px 4px' }}>{catTotal(cat, mi) ? fmtMoney(catTotal(cat, mi)) : '—'}</td>)
                      : <td style={{ ...colStyle, fontSize: 12, fontWeight: 600, color: isIncome ? 'var(--gold)' : 'var(--soft-white)', padding: '10px 4px' }}>{catTotal(cat, 'annual') ? fmtMoney(catTotal(cat, 'annual')) : '—'}</td>}
                    <td style={{ ...colStyle, fontSize: 12, fontWeight: 700, color: isIncome ? 'var(--gold)' : 'var(--soft-white)', padding: '10px 4px' }}>{catTotal(cat, 'annual') ? fmtMoney(catTotal(cat, 'annual')) : '—'}</td>
                  </tr>
                  {isOpen && lines.map(line => (
                    <tr key={line.id} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '7px 16px 7px 36px', fontSize: 12, color: 'var(--muted)' }}>
                        {line.name}<small style={{display:'block'}}>Vendor: {line.vendorName||'Unassigned'}</small>{data.accounts.length > 1 ? <small style={{ display:'block', opacity:.7 }}>{data.accounts.find(account => String(account.id) === line.accountId)?.name || line.accountId}</small> : null}
                      </td>
                      {period === 'monthly'
                        ? MONTHS.map((_, mi) => (
                          <td key={mi} style={{ padding: '4px' }}>
                            {!readOnly && editCell?.lineId === line.id && editCell?.month === mi ? (
                              <input type="number" autoFocus
                                defaultValue={getCellVal(line, mi)}
                                onBlur={e => { reviewCellVal(line, mi, e.target.value); setEditCell(null) }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') e.currentTarget.blur()
                                  if (e.key === 'Escape') setEditCell(null)
                                }}
                                style={{ width: 64, textAlign: 'right', fontSize: 12, background: 'rgba(197,164,109,0.08)', border: '1px solid rgba(197,164,109,0.35)', borderRadius: 6, padding: '3px 6px', color: 'var(--white)', outline: 'none' }}
                              />
                            ) : (
                              <div onClick={() => !readOnly && setEditCell({ lineId:line.id, month:mi })}
                                style={{ cursor: readOnly ? 'default' : 'text', textAlign: 'right', fontSize: 12, padding: '3px 6px', borderRadius: 6,
                                  color: getCellVal(line, mi) !== '' ? 'var(--white)' : 'rgba(255,255,255,0.15)',
                                  border: '1px solid transparent' }}
                                onMouseEnter={e => { if (!readOnly) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
                                {getCellVal(line, mi) !== '' ? fmtMoney(getCellVal(line, mi)) : '—'}
                              </div>
                            )}
                          </td>
                        ))
                        : (
                          <td style={{ padding: '4px' }}>
                            <div
                              title="Calculated from reviewed monthly targets"
                              style={{ cursor: 'default', textAlign: 'right', fontSize: 12, padding: '3px 6px', borderRadius: 6,
                                color: annualTotal(line) ? 'var(--white)' : 'rgba(255,255,255,0.15)',
                                border: '1px solid transparent' }}>
                              {annualTotal(line) ? fmtMoney(annualTotal(line)) : '—'}
                            </div>
                          </td>
                        )}
                      <td style={{ padding: '7px 4px', fontSize: 12, fontWeight: 600, textAlign: 'right', color: annualTotal(line) ? 'var(--soft-white)' : 'rgba(255,255,255,0.15)' }}>
                        {annualTotal(line) ? fmtMoney(annualTotal(line)) : '—'}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
            <tr style={{ borderTop: '2px solid rgba(255,255,255,0.10)', background: 'rgba(197,164,109,0.04)' }}>
              <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--white)' }}>Net Income</td>
              {period === 'monthly'
                ? MONTHS.map((_, mi) => {
                    const net = netTotal(mi)
                    return <td key={mi} style={{ ...colStyle, fontSize: 12, fontWeight: 700, color: net >= 0 ? 'var(--gold)' : 'var(--expense-color)', padding: '12px 4px' }}>{fmtMoney(net)}</td>
                  })
                : <td style={{ ...colStyle, fontSize: 13, fontWeight: 700, color: 'var(--gold)', padding: '12px 4px' }}>{fmtMoney(MONTHS.reduce((s, _, mi) => s + netTotal(mi), 0))}</td>}
              <td style={{ ...colStyle, fontSize: 13, fontWeight: 700, color: 'var(--gold)', padding: '12px 4px' }}>
                {fmtMoney(MONTHS.reduce((s, _, mi) => s + netTotal(mi), 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>{readOnly ? 'Budget targets are read-only for household members.' : 'Editing a monthly target opens Action Mode review · unreviewed months follow the recurring plan · annual totals are calculated from all monthly budget values'}</p>
    </div>
  )
}

// ── Reporting View ────────────────────────────────────────────────────────────────
// ── Cash Flow Report ─────────────────────────────────────────────────────────
