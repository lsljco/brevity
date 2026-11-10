# Scenario Studio

Scenario Modeling now opens Scenario Studio. The previous workbook import, income scenarios, and recovery plans remain in the expandable legacy workspace. Six tabs use existing Finance theme tokens and respect the member's read-only access.

## Data and persistence

Select an existing scenario to create a snapshot. Its existing known take-home income and recurring expense total are preserved. Required monthly debt payments are separated from that total, not added twice. Imported workbook debt and annual-tax notes are carried forward when present; imported debt has principal-only treatment until an APR is entered. Otherwise the current debt register seeds the list. A snapshot does not silently refresh operating records or overwrite the original scenario. Original scenarios can be selected again to create a fresh snapshot.

Draft changes recalculate locally. Save uses forecast.update with a validated studioJson payload, the acknowledged shared-state version, and the existing Action Mode review/audit/Undo path. Named plans are stored under studioPlans in brevity_finance_scenarios_v1. Other scenarios and recoveryPlans are preserved. An optional studioDefaultFloor affects newly created scenarios, not existing plans.

## Net income

Known monthly take-home pay remains authoritative. Gross salary mode estimates annualized 2026 Georgia W-2 income using IRS federal brackets and standard deductions, Georgia's 4.99% tax, $15,000/$30,000 standard deduction and $5,000 qualifying-dependent deduction, employee Social Security and Medicare, and Additional Medicare thresholds. Tax profiles group incomes by person/tax unit. Added estimated jobs share the incremental income-tax burden above existing listed gross and other explicitly supplied earnings. Missing existing gross blocks that estimate rather than assuming there is no other taxable income.

Social Security withholding is capped separately for each estimated employer. Possible refunds of excess withholding are not spendable cash. Pre-tax deductions reduce income tax but not FICA, appropriate for traditional retirement deductions. Federal credits are explicit annual values after eligibility and phaseouts, not inferred from dependent count. Post-tax deductions and additional withholding reduce net pay. Itemized returns, self-employment, other states and FICA-exempt benefits require known net pay. The model freezes verified 2026 rules across future projected years and labels that assumption; it is not an employer payroll or partial-year return calculation.

Sources verified during implementation:
- https://www.irs.gov/publications/p505
- https://dor.georgia.gov/taxes/important-tax-updates
- https://dor.georgia.gov/document/document-document/2026-employers-tax-guide-updated-june-2026/download
- https://www.ssa.gov/oact/COLA/cbbdet.html
- https://www.irs.gov/businesses/small-businesses-self-employed/questions-and-answers-for-the-additional-medicare-tax

## Forecast and cash floor

The persistent summary follows dated payments in the selected horizon month, including partial first months; overview and comparison tables identify their normalized monthly run rates. Monthly, twice-monthly (1st/16th), biweekly and weekly income schedules are supported. Expense rows additionally support annual and one-time obligations. All rows have effective/end dates and can be excluded or changed without altering the ledger.

Opening total cash must be supplied. The editable floor and separately protected reserve are excluded from extra-payoff funds. Extra settlements remain disabled until dates and debt allocation are confirmed. Each date includes required debt payments once and accrues estimated simple daily APR interest. Required payments stop after settlement. A conservative backward funding envelope protects all future modeled bills and debt minimums through the horizon; it does not assume future payoff releases when calculating safe extra-payment capacity. Selected liabilities are fully settled in priority order among affordable debts. Minimum-only liabilities retain required payments. This does not claim a globally optimal partial-payment strategy or model lender fees.

Existing shortfalls are reported explicitly. Forecasting cannot make an initially underfunded household satisfy a larger floor. Unknown opening cash yields unavailable cash metrics, not a zero balance. Monthly and payment-date tables, payoff schedules, comparison outcomes, favorites and XLSX/CSV/PDF exports use the existing Finance exporter.

## Verification

Unit tests cover tax arithmetic, combined jobs, deductions, missing criteria, dated payroll, reserves, future tax bills, floor changes, no duplicate minimum payments, invalid input, and non-destructive shared saves. Browser coverage visits all six tabs, edits tax criteria and the floor, inspects both themes, checks horizontal overflow and verifies the save payload. Existing Scenario Modeling regressions open the legacy disclosure explicitly.
