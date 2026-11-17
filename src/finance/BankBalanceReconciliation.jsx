import FinanceExport from './FinanceExport.jsx'
import {recordsSection} from './financeExportData.js'
import { fmtMoney } from './projection.js'

export default function BankBalanceReconciliation({accounts=[],history,compact=false}) {
  let observations=history
  if (!observations) {
    try { observations=JSON.parse(localStorage.getItem('brevity_shared_state_meta_v1') || '{}').plaid_actuals_cache?.plaidBalanceHistory || [] } catch { observations=[] }
  }
  return <section aria-label="Bank balance reconciliation"><h3>Review your balances</h3>{!compact&&<FinanceExport report={{title:'Bank balance reconciliation',notes:['Retained sync observations, not bank-certified daily closing balances.'],sections:[recordsSection('Observations',accounts.filter(a=>a.plaidAccountId).flatMap(a=>observations.filter(r=>r.kind==='transaction-sync'&&Number.isFinite(r.balances?.[a.plaidAccountId])).map(r=>({account:a.name,capturedAt:r.capturedAt,balance:r.balances[a.plaidAccountId],...r.reconciliation?.[a.plaidAccountId]}))))]}}/>}
    <details><summary>Balance history and matching details</summary><p>Compares completed bank syncs. Matching balance movement is not statement reconciliation.</p></details>
    {accounts.filter(a=>a.plaidAccountId).map(account=>{
      const rows=observations.filter(row=>row.kind==='transaction-sync' && Number.isFinite(row.balances?.[account.plaidAccountId])).sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt))
      const latest=rows.at(-1),check=latest?.reconciliation?.[account.plaidAccountId]
      const differences=rows.filter(row=>row.reconciliation?.[account.plaidAccountId]?.status==='difference')
      return <div className="accounting-card" key={account.id}><strong>{account.name}</strong>{latest&&<h2>{fmtMoney(latest.balances[account.plaidAccountId])}</h2>}<p role="status">{!latest ? 'Sync transactions to establish paired balance evidence.' : check?.status==='matched' ? 'Latest balance movement matches posted activity.' : check?.status==='difference' ? `Reconciliation difference: ${fmtMoney(check.difference)}. The feeds may be out of step; the next transaction sync will compare again.` : check?.status==='history-loading' ? 'Plaid is still loading history; reconciliation is not complete.' : 'Baseline saved. Waiting for another completed sync to compare movement.'}</p>
        <p><small>Statement reconciliation not completed.</small></p>{latest && <small>Retrieved {new Date(latest.capturedAt).toLocaleString('en-US',{timeZone:'America/New_York'})} Eastern · Current {fmtMoney(latest.balances[account.plaidAccountId])}</small>}
        {differences.length>0 && <details><summary>{differences.length} recorded reconciliation differences</summary>{differences.slice().reverse().map(row=><p key={row.batchId}>{row.capturedAt} · {fmtMoney(row.reconciliation[account.plaidAccountId].difference)} · Retained for review; a later match does not explain this earlier difference.</p>)}</details>}
      </div>
    })}
  </section>
}
