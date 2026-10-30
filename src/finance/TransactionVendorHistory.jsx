import {transactionVendorHistory} from './vendorHistory.js'
import {fmtMoney} from './projection.js'
export default function TransactionVendorHistory({transaction,transactions=[],scopeLabel='',onOpenTransaction}){
 const h=transactionVendorHistory(transaction,transactions)
 const trend=h.months.slice(0,12).reverse(),maximum=Math.max(1,...trend.map(m=>m.expenses))
 return <section style={{padding:16,borderRadius:14,background:'rgba(28,34,43,.35)',border:'1px solid rgba(197,164,109,.3)',color:'#f5f2e9'}} aria-label="Vendor history">
  <strong>{h.identity?.name||'Vendor not identified'}</strong>
  <p>{h.identity?.source||'Assign a vendor to establish reliable history.'}</p>
  {h.identity&&<details><summary style={{cursor:'pointer',minHeight:44}}>{h.otherExpenses} other posted expenses · {h.rows.length} total bank records</summary>
   <p>{scopeLabel}. Available imported history only. Pending items are separate; posted replacements supersede pending records.</p>
   {trend.length>0&&<figure style={{margin:'16px 0'}} aria-label="Monthly merchant spending trend">
    <figcaption>Posted spending by month</figcaption>
    <svg role="img" aria-label="Merchant expense trend. Exact amounts appear in the table below." viewBox={`0 0 ${Math.max(320,trend.length*65)} 150`} style={{width:'100%',maxHeight:180}}>
     {trend.map((m,i)=>{const width=Math.max(320,trend.length*65)/trend.length,height=m.expenses/maximum*100;return <g key={m.month}><title>{m.month}: {fmtMoney(m.expenses)}</title><rect x={i*width+8} y={110-height} width={Math.max(8,width-16)} height={height} rx="4" fill="#C5A46D"/><text x={(i+.5)*width} y="135" textAnchor="middle" fontSize="10" fill="#f5f2e9">{m.month}</text></g>})}
    </svg>
    <small>Most recent 12 months with imported records. Gaps do not establish zero spending.</small>
   </figure>}
   <div style={{overflowX:'auto'}}><table><thead><tr><th>Month</th><th>Expenses</th><th>Expense count</th><th>Average expense</th><th>Credits</th></tr></thead><tbody>{h.months.map(m=><tr key={m.month}><td>{m.month}</td><td>{fmtMoney(m.expenses)}</td><td>{m.count}</td><td>{fmtMoney(m.average)}</td><td>{fmtMoney(m.credits)}</td></tr>)}</tbody></table></div>
   <ul>{h.rows.map(t=><li key={t.id}>{onOpenTransaction&&t.id!==transaction.id&&<button type="button" onClick={()=>onOpenTransaction(t)} style={{minHeight:44,background:'transparent',color:'#D9BD8B',border:'1px solid rgba(197,164,109,.3)',borderRadius:8,marginRight:8}}>Open transaction</button>}{t.date} · {t.name} · {fmtMoney(Math.abs(Number(t.amount)||0))} · {t.pending?'Pending':Number(t.amount)<0?'Posted credit':'Posted expense'}</li>)}</ul>
  </details>}
 </section>
}
