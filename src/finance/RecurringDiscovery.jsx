import { useMemo, useState, useEffect } from 'react'
import { discoverRecurring, recurringCoverage } from './recurringDiscovery.js'
import { getHouseholdDateKey } from './financeTime.js'
import { fmtMoney } from './projection.js'
import { SHARED_STATE_EVENT } from '../household/sharedState.js'
import './RecurringDiscovery.css'

function Suggestion({suggestion:s,accounts,scheduled,budget,today,onReview,readOnly,onDismiss}) {
  const [accountId,setAccountId]=useState(s.accountId)
  const [amount,setAmount]=useState(String(s.amount))
  const [monthly,setMonthly]=useState(String(s.stableAmount?s.history.filter(row=>row.count).at(-1).total:s.monthlyAmount))
  const [date,setDate]=useState(s.proposedDate)
  const [frequency,setFrequency]=useState(s.frequency)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[staged,setStaged]=useState('')
  const coverage=recurringCoverage(s,{scheduled,budget,today,accountId,legacyAccountId:accounts.find(a=>/operating account/i.test(a.name))?.id})
  async function review(kind) {
    setError('');setBusy(true)
    try {
      const value=Number(kind==='budget'?monthly:amount)
      if(!accountId || !Number.isFinite(value) || value<=0)throw new Error('Select an account and enter an amount greater than zero.')
      if(kind==='forecast' && (!date || date<today))throw new Error('Choose today or a future payment date.')
      const ok=await onReview({suggestion:s,kind,accountId,amount:value,date,frequency})
      if(ok)setStaged(kind)
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <article className="finance-card recurring-suggestion">
    <div className="recurring-suggestion-heading"><h3>{s.name}</h3><button onClick={onDismiss}>Not recurring / Dismiss</button></div>
    <p>{s.direction==='income'?'Income':'Expense'} · {s.confidence} pattern · Seen in {s.monthsSeen} of 6 completed months · {s.frequency==='biweekly'?'Likely every two weeks':s.frequency==='weekly'?'Likely weekly':s.multiple?'Repeated monthly activity':'Likely monthly'}</p>
    <p>Average observed monthly total: <strong>{fmtMoney(s.monthlyAmount)}</strong>. {s.multiple?'Multiple charges are included; inspect the history before scheduling a combined payment. ':''}{s.stableAmount?'Recent stable monthly total suggested.':'Amounts vary; monthly average suggested.'} This is a suggestion, not a confirmed bill.</p>
    <p>Current month: {fmtMoney(s.currentTotal)} posted ({s.currentCount} transactions). {s.typicalDay?`Usually posts around day ${s.typicalDay}; the proposed date is an estimate, not a due date.`:'No reliable monthly posting day; review the date and frequency.'}</p>
    <details><summary>Six-month history and transactions</summary><div className="recurring-history">{s.history.map(row=><div key={row.month}><strong>{row.month}</strong><span>{row.count?fmtMoney(row.total):'Not observed'}</span><small>{row.count} transactions</small></div>)}</div><ul>{[...s.transactions].sort((a,b)=>a.date.localeCompare(b.date)).map((tx,i)=><li key={tx.id||i}>{tx.date} · {tx.name} · {fmtMoney(Math.abs(tx.amount))}</li>)}</ul></details>
    <p><strong>Current budget:</strong> {coverage.exactAmount>0?`${fmtMoney(coverage.exactAmount)} for this vendor/payer.`:'No positive vendor/payer target or scheduled amount found.'} {coverage.categoryAmount>0?`${fmtMoney(coverage.categoryAmount)} is planned in ${s.category} on this account; review that allocation before adding more.`:''}</p>
    <p><strong>Cash Forecast:</strong> {coverage.forecast.length?`Existing entry: ${coverage.forecast.map(row=>row.name).join(', ')}. Review it before adding another.`:'No matching active or future entry found.'}</p>
    <div className="recurring-proposal-fields">
      <label>Account<select value={accountId} onChange={e=>{setAccountId(e.target.value);setStaged('')}}><option value="">Select account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label>Monthly budget target<input type="number" min="0.01" step="0.01" value={monthly} onChange={e=>setMonthly(e.target.value)}/></label>
      <label>Payment / deposit amount<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
      <label>Next payment / deposit date<input type="date" min={today} value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label>Frequency<select value={frequency} onChange={e=>setFrequency(e.target.value)}><option value="monthly">Monthly</option><option value="biweekly">Every two weeks</option><option value="weekly">Weekly</option><option value="once">One time</option></select></label>
    </div>
    <p className="recurring-help">Add to Budget proposes a target for this month in the Budget Plan Grid. Add to Cash Forecast proposes a scheduled entry, which also feeds the monthly cash budget. Both require Action Mode approval. Confirm the next payment has not already posted. Monthly dates 29–31 use the last day of shorter months.</p>
    {error&&<p role="alert">{error}</p>}{staged&&<p role="status">{staged==='budget'?'Budget':'Cash Forecast'} proposal opened in Action Mode; approve it there to save.</p>}
    <div className="recurring-proposal-actions"><button disabled={readOnly||busy||coverage.exactAmount>0} onClick={()=>review('budget')}>Add to Budget</button><button disabled={readOnly||busy||coverage.forecast.length>0} onClick={()=>review('forecast')}>Add to Cash Forecast</button></div>
  </article>
}
export default function RecurringDiscovery({actuals,scheduled,accounts,accountMap,onReview,readOnly}) {
  const today=getHouseholdDateKey(),[dismissed,setDismissed]=useState(new Set()),[budget,setBudget]=useState(()=>{try{return JSON.parse(localStorage.getItem('lslj_budget_v1'))||{}}catch{return{}}})
  useEffect(()=>{const refresh=()=>{try{setBudget(JSON.parse(localStorage.getItem('lslj_budget_v1'))||{})}catch{}};window.addEventListener('storage',refresh);window.addEventListener(SHARED_STATE_EVENT,refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener(SHARED_STATE_EVENT,refresh)}},[])
  const report=useMemo(()=>discoverRecurring(actuals,{today,accountMap}),[actuals,today,accountMap])
  return <section aria-label="Discover recurring income and expenses">
    <div className="finance-card recurring-suggestion"><h2>Discover recurring income & expenses</h2><p>{report.months[0]} through {report.months.at(-1)} · Six completed months · Selected accounts</p><p>Posted transactions only. Amount changes do not prevent a match. Transfers, refunds, pending transactions, and unclassified credits are excluded. Patterns use linked vendors/payers or matching merchant names; unfamiliar statement names may need a vendor link.</p><p>Available activity appears in {report.observedMonths} of 6 months. Missing activity may mean incomplete bank history; “not observed” does not establish that a charge stopped.</p>{dismissed.size>0&&<button onClick={()=>setDismissed(new Set())}>Restore dismissed suggestions this session ({dismissed.size})</button>}</div>
    {!report.suggestions.filter(s=>!dismissed.has(s.key)).length&&<p>No suggestions to review. At least two completed months of matching posted activity are needed.</p>}
    {report.suggestions.filter(s=>!dismissed.has(s.key)).map(s=><Suggestion key={s.key} suggestion={s} {...{accounts,scheduled,budget,today,onReview,readOnly}} onDismiss={()=>setDismissed(prev=>new Set([...prev,s.key]))}/>)}
  </section>
}
