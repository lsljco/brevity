import {fmtMoney} from './projection.js'
const signed=value=>`${value<0?'−':'+'}${fmtMoney(Math.abs(value||0))}`
export default function CashForecastBalanceBridge({point}) {
 if(!point||point.mode!=='reconciled')return null
 return <details className="finance-card" style={{margin:'12px 0'}}>
  <summary>Today’s balance explained · {fmtMoney(point.bal)}</summary>
  <dl aria-label="Today’s cash balance reconciliation">
   <dt>Prior day’s {point.openingSource==='verified-close'?'recorded':'estimated posted'} closing balance</dt><dd>{fmtMoney(point.openingBalance)}</dd>
   <dt>Posted bank activity today</dt><dd>{signed(point.postedTodayDelta)}</dd>
   {point.bankReconciliationDelta!==0&&<><dt>Unreconciled difference to bank snapshot</dt><dd>{signed(point.bankReconciliationDelta)}</dd></>}
   <dt>Bank posted balance</dt><dd>{fmtMoney(point.currentBalance)}</dd>
   <dt>Bank availability adjustment, including outstanding holds</dt><dd>{signed(point.availabilityDelta)}</dd>
   <dt>Bank available / starting balance</dt><dd>{fmtMoney(point.anchorBalance)}</dd>
   {point.pendingDelta!==0&&<><dt>Pending activity for accounts without an available balance</dt><dd>{signed(point.pendingDelta)}</dd></>}
   <dt>Remaining scheduled activity today</dt><dd>{signed(point.remainingDelta)}</dd>
   <dt>Projected cash ending balance</dt><dd>{fmtMoney(point.bal)}</dd>
  </dl>
  <p>Historical balances reflect posted activity. Today starts from the bank’s available cash, which can include pending holds from earlier dates. These holds are counted once.</p>
  {point.bankReconciliationDelta!==0&&<p role="status">The prior close and posted activity do not fully reconcile to the bank snapshot. This difference is shown separately, not treated as a transaction.</p>}
  {point.budgetReserved>0&&<p>Unscheduled budget reserve: {fmtMoney(point.budgetReserved)}. Cash after this reserve: {fmtMoney(point.balanceAfterBudgetReserve)}. The reserve is separate from the cash ending balance.</p>}
 </details>
}
