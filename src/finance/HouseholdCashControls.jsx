import {useState} from 'react'
import {fmtMoney} from './projection.js'
export default function HouseholdCashControls({model,onTransaction,onProposeAction}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false)
 if(!model)return null
 return <section aria-label="Household cash controls" style={{background:'rgba(28,34,43,.35)',border:'1px solid rgba(197,164,109,.3)',borderRadius:18,padding:20,margin:'16px 0'}}>
  <h2>Protect Operating cash</h2><p>{model.scopeLabel}. {model.from} through {model.to}.</p>
  <p><strong>{model.available?model.exceptionCount:'Unknown'}</strong> items to review · Dividend Expense: <strong>{model.dividendExpense==null?'Unavailable':fmtMoney(model.dividendExpense)}</strong></p>
  <p>Personal allowance target: $50 per eligible adult each Friday. Budget the actual number of Fridays, including five-Friday months. Personal spending belongs in personal accounts; transfers out are household Dividend Expense.</p>
  <details><summary>Control gaps and evidence</summary><ul><li>Enable bank notifications for every Operating transfer and withdrawal; confirm all authorized users follow the approval process.</li><li>Record every card’s current statement, minimum due, due date and automatic payment setting in Vendors. Store access details in the protected login area.</li><li>Review creditor draft authorizations and move to scheduled bank bill pay where supported. Verify payment timing and contractual requirements before changing a draft.</li><li>Resolve any reported card payoff using the payoff statement, recent withdrawals and any new charges. A reported payoff alone does not establish the current balance.</li></ul>
  <p>{model.notice}</p>{model.exceptions.map(row=><article key={row.id} style={{padding:'12px 0',borderTop:'1px solid rgba(197,164,109,.25)'}}><strong>{row.name} · {fmtMoney(row.amount)}</strong><p>{row.date} · {row.reason}</p>{onTransaction&&<button type="button" onClick={()=>onTransaction(row.id)}>Open transaction</button>}{onProposeAction&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onProposeAction({text:`Review ${row.name} (${row.date}, ${fmtMoney(row.amount)}): ${row.reason} Source ${row.id}.`,owner:'Larry',due:model.to,transactionId:row.id,financialEffect:'Protect Operating cash and confirm the payment plan.'})}catch(e){setError(e.message)}finally{setBusy(false)}}}>Propose follow-up</button>}</article>)}</details>{error&&<p role="alert">{error}</p>}
 </section>
}
