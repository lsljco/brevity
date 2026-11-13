# Scenario reserve and payoff audit

Scenario Studio uses monthly net income, living costs, and capped required payments. Annual tax settlements and extra debt settlements are separate cash movements. Paid debt payments are removed from future cash flow and the affordability calculation, rather than added as new income.

New plans default to a $24,000 editable floor. Older saved plans are upgraded as visible drafts; they are not silently written to household records. The reserve is never treated as opening cash. Where all checking/savings records have unique linked bank balances, the user can explicitly choose the labeled saved snapshot and review earmarked funds. Historical plans require their historical opening cash.

The engine protects future ordinary bills and, before discretionary debt settlements, future annual taxes through the visible horizon plus 12 months. Current due tax bills take precedence over later tax bills. If funding is insufficient, taxes remain outstanding with a due-month shortfall. Required outflows may themselves produce a shortfall; extra settlements cannot breach the floor. Full settlements assume estimated interest and exclude lender fees.

Property-tax templates start in October; income-tax balance templates start in April. Dates and amounts are editable household planning assumptions. Unpaid prior-year taxes belong in Liabilities, future annual balances in Expenses. Income-tax balances must be after payroll withholding. Missing future annual tax assumptions produce a warning, even when arrears exist.

## Reconciliation examples

- Opening cash $24,000, monthly net $8,000, living costs $5,000, and a $5,000 debt with a $1,000 minimum: January cash flow $2,000; February settlement $3,000; February ending cash $25,000; March cash flow $3,000. Total required and extra payments equal $5,000.
- A $10,000 January tax bill with only $3,000 above the floor remains unpaid. Cash stays $27,000, and outstanding tax remains $10,000.
- A currently affordable tax bill is not withheld solely to accumulate cash for an unaffordable later tax bill.
- Every ledger cash movement reconciles from opening to closing cash. Final settlements through minimum payments use a zero additional-cash row to prevent double counting.

## Verification

The 1,918-test unit suite passes, including reserve rebuilding, edited floors, APR/minimum behavior, future tax funding, repeated annual bills, arrears, unknown opening cash, partial months, shared-state saving, and ledger arithmetic. Production build and source/bundle budgets pass.

Browser regression tests exercise net pay on all six tabs, independent gross/net fields, floor editing, the descriptive ledger and tax payments, desktop, phone, portrait tablet, landscape tablet, and both themes. Visual inspection identified and corrected the light-theme sticky-header contrast. Tables scroll within their own bounds; the page does not overflow horizontally. Full-month known-net regression selects a complete future month because the first month is prorated.

These checks use isolated fixtures. They do not certify household bank freshness, actual lender settlement figures, or missing tax amounts, and do not execute financial payments.
