import {budgetCoverage} from './budgetCoverage.js'
import {fmtMoney} from './projection.js'
import './BudgetCoverage.css'

export default function BudgetCoverage({rawActuals,includedActuals,accountMap,accounts,month,includeUnmapped,totalActual,onReviewAccounts}){
 const c=budgetCoverage({rawActuals,includedActuals,accountMap,accountIds:accounts.map(a=>a.id),month,includeUnmapped})
 const mismatch=Math.abs(c.expenses.amount-totalActual)>.01
 return <section className="budget-coverage" aria-label="Expense total coverage">
  <div><strong>What this expense total includes</strong><p>{accounts.map(a=>a.name).join(', ')} · {month} · Posted expenses only</p></div>
  {(c.unmapped.count>0||mismatch)&&<p role="status" className="budget-coverage-warning">{mismatch?'The coverage breakdown and expense total differ. Review source adjustments before relying on this result. ':''}{c.unmapped.count>0?`${c.unmapped.count} posted debits (${fmtMoney(c.unmapped.amount)}) have no confirmed account mapping. ${includeUnmapped?'Included in this broad view when classified as expenses; household ownership is not established.':'Excluded from this selected-account total; do not assume they belong to Operating.'}`:''}</p>}
  <details><summary>Explain included and excluded cash movements</summary>
   <dl>{[
    ['Posted debits in this scope',c.scopedPostedDebits],
    ['Included as expenses',c.expenses.amount],
    ['Excluded as transfers / card payments',c.transfers.amount],
    ['Hidden by saved rules or overrides',c.hidden.amount],
    ['Other excluded posted debits',c.otherExcluded.amount],
    ['Pending debits in this scope (separate)',c.pending.amount],
    ['Posted debits on other mapped accounts (separate)',c.outside.amount],
   ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{fmtMoney(value)}</dd></div>)}</dl>
   <p>Transfers and card payments can reduce bank cash even when excluded from expense reporting. A personal distribution must be identified as Dividend Expense before using this view as the household surplus measure. Selecting All does not establish household ownership of unmapped activity.</p>
   {c.invalid.count>0&&<p>{c.invalid.count} records have invalid amounts and need source review.</p>}
   {onReviewAccounts&&<button type="button" onClick={onReviewAccounts}>Review account links</button>}
  </details>
 </section>
}
