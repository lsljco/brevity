import {transactionVendorHistory} from './vendorHistory.js'
import {fmtMoney} from './projection.js'
export default function TransactionVendorHistory({transaction,transactions=[],scopeLabel=''}){
 const h=transactionVendorHistory(transaction,transactions)
 return <section style={{padding:16,borderRadius:14,background:'rgba(28,34,43,.35)',border:'1px solid rgba(197,164,109,.3)',color:'#f5f2e9'}} aria-label="Vendor history">
  <strong>{h.identity?.name||'Vendor not identified'}</strong>
  <p>{h.identity?.source||'Assign a vendor to establish reliable history.'}</p>
  {h.identity&&<details><summary style={{cursor:'pointer',minHeight:44}}>{h.otherExpenses} other posted expenses · {h.rows.length} total bank records</summary>
   <p>{scopeLabel}. Available imported history only. Pending items are separate; posted replacements supersede pending records.</p>
   <div style={{overflowX:'auto'}}><table><thead><tr><th>Month</th><th>Expenses</th><th>Average expense</th><th>Credits</th></tr></thead><tbody>{h.months.map(m=><tr key={m.month}><td>{m.month}</td><td>{fmtMoney(m.expenses)}</td><td>{fmtMoney(m.average)}</td><td>{fmtMoney(m.credits)}</td></tr>)}</tbody></table></div>
   <ul>{h.rows.map(t=><li key={t.id}>{t.date} · {t.name} · {fmtMoney(Math.abs(Number(t.amount)||0))} · {t.pending?'Pending':Number(t.amount)<0?'Posted credit':'Posted expense'}</li>)}</ul>
  </details>}
 </section>
}
