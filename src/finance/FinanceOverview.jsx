import { fmtMoney } from './projection.js'
import { financeOverviewModel } from './financeOverviewModel.js'
import './FinanceOverview.css'

const workspaces = [
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

export default function FinanceOverview({ accounts, projection, today, live, transactionStatus, unmappedCount, error, onNavigate, onOpenForecast, onReviewEarlier, scopeLabel, nextMeeting }) {
  const model = financeOverviewModel({ accounts, projection, today, live, transactionStatus, unmappedCount, error })
  const money = value => Number.isFinite(value) ? fmtMoney(value) : 'Unavailable'
  return <div className="finance-overview">
    <header className="finance-overview-hero"><span className="life-eyebrow">Jenkins–Seay Household</span><h1>Finance</h1><p>Steward today. Prepare for tomorrow.</p></header>
    <div className="finance-overview-scope"><span>{scopeLabel} · Checking &amp; savings</span><button type="button" onClick={() => onNavigate('accounts')}>{live ? 'Bank balances verified' : 'Saved balances · freshness unverified'}</button></div>
    <section className="finance-overview-position" aria-label="Financial position">
      {[
        ['Cash balance', model.cash, live ? 'Verified bank snapshot' : 'Saved values', () => onNavigate('accounts')],
        ['Projected month end', model.monthEnd, model.monthEndDate, () => onOpenForecast(model.monthEndDate)],
        ['Lowest forecast · next 30 days', model.floor?.balance, model.floor?.date || 'No forecast available', () => onOpenForecast(model.floor?.date)],
      ].map(([label, value, detail, open]) => <button type="button" key={label} onClick={open}><span>{label}</span><strong>{money(value)}</strong><small>{detail}</small></button>)}
    </section>
    {model.attention.length > 0 && <section className="finance-overview-attention" aria-label="Financial items needing attention"><h2>Needs attention <small>{model.attention.length}</small></h2>{model.attention.map(item => <button type="button" key={item.id} onClick={() => item.id === 'earlier' ? onReviewEarlier() : item.date ? onOpenForecast(item.date) : onNavigate(item.view)}><span><strong>{item.title}</strong><small>{item.detail}</small></span><i className="ti ti-arrow-up-right" aria-hidden="true"/></button>)}</section>}
    <section className="finance-overview-meeting"><div><span className="life-eyebrow">Financial rhythm</span><h2>{nextMeeting?.title || 'Daily financial review'}</h2><p>{nextMeeting?.detail || 'Daily · 7–10 minutes · Reports prepared automatically'}</p></div><button type="button" onClick={() => onNavigate('daily-alignment')}>Open Meetings <i className="ti ti-arrow-up-right" aria-hidden="true"/></button></section>
    <nav className="finance-overview-workspaces" aria-label="Finance destinations">{workspaces.map(([id, label, detail, icon, photo]) => <button type="button" key={id} className={photo ? 'has-photo' : ''} onClick={() => onNavigate(id)}>{photo && <img src={`/imagery/${photo}.webp`} alt="" loading="lazy"/>}<span className="finance-overview-destination"><i className={`ti ${icon}`} aria-hidden="true"/><span><strong>{label}</strong><small>{detail}</small></span><i className="ti ti-arrow-up-right" aria-hidden="true"/></span></button>)}</nav>
  </div>
}
