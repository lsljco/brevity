import './CashForecastWorkspace.css'

export default function CashForecastToolbar({ monthName, previous, next, today, scopeLabel, accountFilter, showActuals, toggleActuals, loading, bankCount, onReconcile }) {
  return <div className="finance-calendar-header finance-forecast-toolbar">
    <div className="finance-forecast-month">
      <button type="button" aria-label="Previous financial calendar month" onClick={previous}><span aria-hidden="true">‹</span></button>
      <p aria-live="polite">{monthName}</p>
      <button type="button" aria-label="Next financial calendar month" onClick={next}><span aria-hidden="true">›</span></button>
    </div>
    <details className="finance-forecast-accounts" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus()}}}>
      <summary aria-label={`Choose forecast accounts: ${scopeLabel}`}>{scopeLabel}<span aria-hidden="true">▾</span></summary>
      {accountFilter}
    </details>
    <button type="button" className="finance-forecast-today" onClick={today}>Today</button>
    <button type="button" className="finance-forecast-actuals" onClick={toggleActuals} disabled={loading} aria-pressed={showActuals}
      aria-label={loading?'Loading bank activity':`${showActuals?'Hide':'Show'} bank activity for ${monthName}`} title={`${bankCount} bank transactions in ${monthName}`}>
      <span className="finance-forecast-switch" aria-hidden="true" /><span>{loading?'Loading…':'Include actuals'}</span>
    </button>
    <button type="button" className="finance-forecast-reconcile-button" onClick={onReconcile}>Reconcile with bank</button>
  </div>
}
