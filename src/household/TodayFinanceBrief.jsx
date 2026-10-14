import {useEffect,useMemo,useState} from 'react'
import {dailyFinancialBrief} from '../finance/dailyFinancialBrief.js'
import {loadFinanceData} from '../finance/financeData.js'
import {FINANCE_REFRESH_EVENT,FINANCE_STORAGE_KEY,PLAID_ACTUALS_KEY,readLatestBalanceRefreshStatus,readTransactionFreshness} from '../finance/financeRefresh.js'
import {getHouseholdDateTimeLabel} from '../finance/financeTime.js'
import {SHARED_STATE_EVENT} from './sharedState.js'
import './TodayFinanceBrief.css'
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value)

function readSnapshot() {
  try {
    const loaded = loadFinanceData(localStorage, FINANCE_STORAGE_KEY)
    const actuals = JSON.parse(localStorage.getItem(PLAID_ACTUALS_KEY) || 'null')
    return { data:loaded.data, actuals, balanceStatus:readLatestBalanceRefreshStatus(), transactionStatus:readTransactionFreshness(localStorage) }
  } catch { return { data:null, actuals:null, balanceStatus:{status:'unknown'}, transactionStatus:{status:'unknown'} } }
}

export default function TodayFinanceBrief({ date, finance = {}, canViewFinance = false, onOpenFinance }) {
  const [snapshot, setSnapshot] = useState(() => canViewFinance ? readSnapshot() : null)
  useEffect(() => {
    if (!canViewFinance) return undefined
    const refresh = event => {
      if (event?.type === 'storage' && ![FINANCE_STORAGE_KEY, PLAID_ACTUALS_KEY].includes(event.key)) return
      if (event?.type === SHARED_STATE_EVENT && !event.detail?.keys?.some(key=>[FINANCE_STORAGE_KEY,PLAID_ACTUALS_KEY].includes(key))) return
      setSnapshot(readSnapshot())
    }
    refresh()
    window.addEventListener(FINANCE_REFRESH_EVENT, refresh)
    window.addEventListener(SHARED_STATE_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener(FINANCE_REFRESH_EVENT, refresh); window.removeEventListener(SHARED_STATE_EVENT, refresh); window.removeEventListener('storage', refresh) }
  }, [canViewFinance])
  const model = useMemo(() => canViewFinance ? dailyFinancialBrief({date,finance:snapshot?.data,actuals:snapshot?.actuals,updatedAt:snapshot?.balanceStatus?.checkedAt,plan:{finance}}) : null,[date,snapshot,canViewFinance,finance])
  return <section className="today-section today-finance-brief" data-pillar="finance" aria-label="Pillar 6 Finance"><div className="today-section-heading"><div><span>Pillar 6 · Finance</span><h2>Balances &amp; today’s cash flow</h2></div><button onClick={()=>onOpenFinance?.('finance')}>Open Finance</button></div>
  {!canViewFinance?<p className="today-finance-restricted">Financial details require your existing Finance permission.</p>:<>
   <div className="today-finance-metrics today-cash-accounts">{[['Operating',model.operatingBalance,model.projectedOperatingMonthEnd],['Savings',model.savingsBalance,model.projectedSavingsMonthEnd]].map(([label,balance,projected])=><article key={label}><h3>{label}</h3><span>Current bank balance</span><strong>{balance===null?'Unavailable':money(balance)}</strong><span>Projected month end · {model.endingDate}</span><strong>{projected===null?'Unavailable':money(projected)}</strong></article>)}</div>
   <div className="today-finance-details">{[['Bills due today',model.bills],['Income expected today',model.income]].map(([label,rows])=><div key={label}><h3>{label}</h3>{rows.length?<ul>{rows.map(item=><li key={item.id}><span>{item.title}<em> · {item.status}</em></span><strong>{Number.isFinite(item.amount)?money(item.amount):'Amount unavailable'}</strong></li>)}</ul>:<p>{snapshot?.data?'None recorded for this day.':'Financial records are unavailable.'}</p>}</div>)}</div>
   <small>{model.updatedAt?`Stored balances updated ${getHouseholdDateTimeLabel(new Date(model.updatedAt))}.`:'Balance update time is unavailable.'} Projections include pending and unmatched scheduled activity. Expected income and bills are not proof of receipt or payment.</small>
   {model.alerts.length>0&&<details><summary>Financial data notes · {model.alerts.length}</summary>{model.alerts.map(item=><p key={item}>{item}</p>)}</details>}
  </>}
  </section>
}
