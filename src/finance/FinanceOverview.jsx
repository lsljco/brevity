import {householdCashControls} from './householdCashControls.js'
import HouseholdCashControls from './HouseholdCashControls.jsx'
import FinanceExport from './FinanceExport.jsx'
import {financeReport} from './financeExportData.js'
import {useMemo,useState} from 'react'
import {buildSpendingAccountability} from './spendingAccountability.js'
import { fmtMoney } from './projection.js'
import { financeOverviewModel } from './financeOverviewModel.js'
import './FinanceOverview.css'

const workspaces = [
  ['spending-review', 'Spending Review', 'Explain exceptions and follow through.', 'ti-receipt'],
  ['calendar', 'Cash Forecast', 'See what lies ahead.', 'ti-calendar-dollar', 'planning-desk'],
  ['budget', 'Budget', 'Give every dollar a purpose.', 'ti-chart-bar', 'home-lounge'],
  ['daily-alignment', 'Meetings', 'Review, decide and follow through.', 'ti-users-group', 'planning-desk'],
  ['accounts', 'Accounts', 'Balances and bank connection health.', 'ti-building-bank'],
  ['transactions', 'Transactions', 'Posted, pending and scheduled activity.', 'ti-list'],
  ['debts', 'Debts', 'Balances and your repayment plan.', 'ti-receipt-2'],
  ['scenario-modeling', 'Scenarios', 'Explore the financial possibilities.', 'ti-chart-arrows'],
  ['reporting', 'Reports', 'Understand income and spending.', 'ti-report-analytics'],
  ['vendors', 'Vendors', 'Household suppliers and payees.', 'ti-building-store'],
  ['recurring', 'Recurring', 'Review recurring commitments.', 'ti-repeat'],
]

export default function FinanceOverview({ accounts, projection, today, live, transactionStatus, unmappedCount, error, onNavigate, onOpenForecast, onReviewEarlier, scopeLabel, nextMeeting, spendingSources, reserveAccounts = [], reserveMinimum, onReviewReserve, readOnly=false }) {
  const [editingReserve,setEditingReserve]=useState(false),[reserve,setReserve]=useState(''),[reserveError,setReserveError]=useState(''),[busy,setBusy]=useState(false)
  const spending = useMemo(()=>spendingSources ? buildSpendingAccountability(spendingSources) : null,[spendingSources])
  const model = financeOverviewModel({ accounts, projection, today, live, transactionStatus, unmappedCount, error })
  const money = value => Number.isFinite(value) ? fmtMoney(value) : 'Unavailable'
  return <div className="finance-overview"><FinanceExport report={financeReport(`Finance overview ${today}`,{position:model,reserveMinimum,reserveAccounts:reserveAccounts.map(({name,balance})=>({name,balance})),spendingTotals:spending?.totals},[scopeLabel,live?'Verified bank snapshot':'Saved balances; freshness unverified',spendingSources?.scopeLabel||'Operating scope unavailable'])}/>
    <header className="finance-overview-hero"><span className="life-eyebrow">Jenkins–Seay Household</span><h1>Finance</h1><p>Steward today. Prepare for tomorrow.</p></header>
    <div className="finance-overview-scope"><span>{scopeLabel} · Checking &amp; savings</span><button type="button" onClick={() => onNavigate('accounts')}>{live ? 'Bank balances verified' : 'Saved balances · freshness unverified'}</button></div>
    <section className="finance-overview-position" aria-label="Financial position">
      {[
        ['Cash balance', model.cash, live ? 'Verified bank snapshot' : 'Saved values', () => onNavigate('accounts')],
        ['Projected month end', model.monthEnd, model.monthEndDate, () => onOpenForecast(model.monthEndDate)],
        ['Lowest forecast · next 30 days', model.floor?.balance, model.floor?.date || 'No forecast available', () => onOpenForecast(model.floor?.date)],
      ].map(([label, value, detail, open]) => <button type="button" key={label} onClick={open}><span>{label}</span><strong>{money(value)}</strong><small>{detail}</small></button>)}
    </section>
    <section className="finance-overview-position" aria-label="Spending and reserve accountability">
      <button type="button" onClick={()=>onNavigate('accounts')}><span>Savings reserve</span><strong>{money(reserveAccounts.length && reserveAccounts.every(a=>Number.isFinite(Number(a.balance))) ? reserveAccounts.reduce((sum,a)=>sum+Number(a.balance),0) : null)}</strong><small>Separate from operating cash; a transfer is required before spending</small></button>
      <button type="button" onClick={()=>onNavigate('spending-review')}><span>Unbudgeted this month</span><strong>{money(spending?.totals.unbudgeted)}</strong><small>Operating only · posted charges</small></button>
      <button type="button" onClick={()=>onNavigate('spending-review')}><span>Category overruns</span><strong>{money(spending?.totals.over)}</strong><small>Review evidence and assign follow-up</small></button>
    </section>
    <section className="finance-overview-meeting" aria-label="Safe-to-spend assumptions"><div><span className="life-eyebrow">Estimated spending capacity · next 30 days</span><h2>{Number.isFinite(reserveMinimum)&&model.floor ? money(Math.max(0,model.floor.balance-reserveMinimum)) : 'Set your operating reserve'}</h2><p>Lowest projected cash less your operating reserve {Number.isFinite(reserveMinimum)?money(reserveMinimum):'(not set)'}. Assumes forecast income arrives and recorded obligations are complete. Savings are separate unless explicitly included in the selected cash scope.</p></div>{!readOnly&&<button type="button" onClick={()=>{setEditingReserve(!editingReserve);setReserve(String(reserveMinimum??''));setReserveError('')}}>Review reserve assumption</button>}</section>
    {editingReserve&&!readOnly&&<form className="spending-editor" onSubmit={async event=>{event.preventDefault();if(!reserve.trim()||!Number.isFinite(Number(reserve))||Number(reserve)<0){setReserveError('Enter a non-negative reserve.');return}setBusy(true);setReserveError('');try{await onReviewReserve(Number(reserve));setEditingReserve(false)}catch(cause){setReserveError(cause.message)}finally{setBusy(false)}}}><label>Operating reserve minimum<input type="number" min="0" step="0.01" value={reserve} onChange={e=>setReserve(e.target.value)} required/></label><button type="submit" disabled={busy}>Review reserve change</button>{reserveError&&<p role="alert">{reserveError}</p>}</form>}
    {model.attention.length > 0 && <section className="finance-overview-attention" aria-label="Financial items needing attention"><h2>Needs attention <small>{model.attention.length}</small></h2>{model.attention.map(item => <button type="button" key={item.id} onClick={() => item.id === 'earlier' ? onReviewEarlier() : item.date ? onOpenForecast(item.date) : onNavigate(item.view)}><span><strong>{item.title}</strong><small>{item.detail}</small></span><i className="ti ti-arrow-up-right" aria-hidden="true"/></button>)}</section>}
    <section className="finance-overview-meeting"><div><span className="life-eyebrow">Financial rhythm</span><h2>{nextMeeting?.title || 'Daily financial review'}</h2><p>{nextMeeting?.detail || 'Daily · 7–10 minutes · Reports prepared automatically'}</p></div><button type="button" onClick={() => onNavigate('daily-alignment')}>Open Meetings <i className="ti ti-arrow-up-right" aria-hidden="true"/></button></section>
    <HouseholdCashControls model={householdCashControls(spendingSources||{},spendingSources?.period)} onTransaction={()=>onNavigate('transactions')}/>
    <nav className="finance-overview-workspaces" aria-label="Finance destinations">{workspaces.map(([id, label, detail, icon, photo]) => <button type="button" key={id} className={photo ? 'has-photo' : ''} onClick={() => onNavigate(id)}>{photo && <img src={`/imagery/${photo}.webp`} alt="" loading="lazy"/>}<span className="finance-overview-destination"><i className={`ti ${icon}`} aria-hidden="true"/><span><strong>{label}</strong><small>{detail}</small></span><i className="ti ti-arrow-up-right" aria-hidden="true"/></span></button>)}</nav>
  </div>
}
