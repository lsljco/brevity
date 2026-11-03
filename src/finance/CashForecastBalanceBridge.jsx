import {fmtMoney} from './projection.js'
const signed=value=>`${value<0?'−':'+'}${fmtMoney(Math.abs(value||0))}`
export default function CashForecastBalanceBridge({point}) {
 if(!point||point.mode!=='reconciled')return null
 return <details className="finance-card" style={{margin:'12px 0'}}>
  <summary>Today’s balance explained · {fmtMoney(point.bal)}</summary>
  <dl aria-label="Today’s cash balance reconciliation">
   <dt>Prior day’s {point.openingSource==='verified-close'?'recorded':'estimated cash'} closing balance</dt><dd>{fmtMoney(point.availableOpeningBalance)}</dd>
   <dt>Posted bank activity today</dt><dd>{signed(point.postedTodayDelta)}</dd>
   <dt>New pending activity today</dt><dd>{signed(point.newPendingDelta)}</dd>
   {point.cashReconciliationDelta!==0&&<><dt>Difference to bank cash snapshot</dt><dd>{signed(point.cashReconciliationDelta)}</dd></>}
   <dt>Cash available before remaining scheduled activity</dt><dd>{fmtMoney(point.anchorBalance+point.pendingDelta)}</dd>
   <dt>Remaining scheduled activity today</dt><dd>{signed(point.remainingDelta)}</dd>
   <dt>Projected cash ending balance</dt><dd>{fmtMoney(point.bal)}</dd>
  </dl>
  <p>Earlier pending charges are included in earlier cash estimates. Today’s bank available balance already includes its holds; they are not deducted again.</p>
  {point.cashReconciliationDelta!==0&&<p role="status">Transaction activity does not fully reconcile to the bank cash snapshot. The difference may include released holds, availability changes or missing activity. It is shown separately, not invented as a transaction.</p>}
  <p>Historical cash balances are estimates from the available transaction history, not verified bank closes.</p>
  {point.budgetReserved>0&&<p>Unscheduled budget reserve: {fmtMoney(point.budgetReserved)}. Cash after this reserve: {fmtMoney(point.balanceAfterBudgetReserve)}. The reserve is separate from the cash ending balance.</p>}
 </details>
}
