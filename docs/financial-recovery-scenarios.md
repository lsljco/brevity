# Financial Scenario Modeling — architecture and implementation

## Purpose and boundaries

Extend Finance → Scenario Modeling with Household Financial Recovery / Vizient Opportunity (Scenario 001). Preserve the original income scenarios. No ledger, bank, budget, reconciliation, or debt record is mutated by a projection. All output is explicitly hypothetical. No confirmed employment or payday is inferred.

## Architecture

1. `FinancePlanner` supplies the existing Finance data, source actuals, normalized debts and freshness message. The recovery workspace is lazy-loaded within `ScenarioModeling`; it is not a separate application.
2. `cashForecastScope` selects all checking/savings accounts by existing type and stable IDs. `buildOutstandingCashForecast` supplies the opening balance and scheduled daily movements, including existing pending/current/available-balance semantics and approved reconciliation. Hypothetical events never enter that function or its inputs.
3. `recoveryScenario.js` performs pure cent-based projections. It supports a confirmed monthly surplus or live scheduled baseline, baseline/conservative/expected/optimistic cases, 14-day payroll, Texas allocations, relocation, taxes, reserves and debt strategies.
4. Named plans live as `recoveryPlans` inside the EXISTING shared `brevity_finance_scenarios_v1` resource. Store only assumptions and versions, never copies of operational financial records. Source changes are reflected on recomputation. Other existing scenarios remain untouched.
5. `forecast.update` accepts a validated complete `recoveryJson` for a stable recovery scenario ID. Existing Action Mode permission checks, acknowledged shared-state version, journal, audit and safe Undo remain authoritative. The server assigns owner/actor and timestamps. Saved revisions remain visible in the workspace; restoring history first creates a draft.
6. Ask Brevity authoritative context includes plan IDs, assumptions, owner and version. Text and the existing voice transport can prepare the same reviewed operation. Applying recommendations to operating budgets or recurring records remains a separate explicitly approved existing action. No payment execution is introduced.

## Initial assumptions

- Confirmed monthly surplus after bills and minimum debt: $6,604.09.
- Hypothetical paycheck: $7,500 every 14 days; conservative/expected monthly cap $15,000; optimistic retains third paychecks.
- Texas allocation: $7,500/month, provisionally throughout November 2026–December 2027; dates editable.
- Expected steady-month surplus: $14,104.09. Conservative contingency: $498.09, producing $13,606.
- Property tax: $30,000; payment date blank. Relocation, reserve and extra debt default to zero, explicitly editable.
- First payday remains blank. No dated payroll is projected until the user supplies a hypothetical date. No tax cash movement is projected until its date is provided or its existing scheduled record is linked in live mode.
- The bundled Scenario 001 template is not represented as a saved household record. First reviewed save establishes the persisted record and audit trail.

## Calculation conventions and limitations

Confirmed monthly surplus and monthly Texas/contingency allocations are spread by calendar day using cumulative cent rounding. Live mode preserves actual scheduled dates. The confirmed surplus already includes minimum debt payments. Minimums reduce modeled debt, but are not deducted from cash twice. Freed minimums remain conservatively in baseline expenses; no automatic recycling is assumed. Additional debt is paid at month-end, capped by the requested extra amount and cash above reserves. Monthly amortized APR debts are supported; other methods produce unavailable debt outputs rather than invented estimates. Savings are compared with minimum-only payments over the same selected horizon. Payoff outside the horizon is explicitly not reached.

In live mode an exact linked tax record supplies its own amount and timing; the scenario tax field is not deducted again. In confirmed mode the modeled tax is incremental to the supplied monthly surplus. Missing opening cash produces unavailable balances and disables extra payments; negative balances are preserved. Source freshness is visible and no stored balance is described as newly verified.

## Implementation sequence

- Inspect existing Finance forecast, debt, shared-state, permissions and Action Mode contracts.
- Implement pure projection/validation and isolation tests.
- Integrate responsive workspace, comparison charts, monthly/pay-period tables and version history.
- Extend reviewed save and authoritative Ask Brevity context.
- Run existing tests, build and source/bundle budgets; publish a PR preview.
- Verify the preview and browser workflow before production publication. Do not merge on unverified preview status.

## Verification record

Local full suite initially passed: 1,621 tests. Targeted tests cover exact scenario totals, calendar biweekly payroll (including 27 checks), unknown/delayed payroll, property-tax timing, negative balances, reserves, debt interest savings, unsupported debt methods, isolation of reconciliation inputs, reviewed save/version/ownership/audit/Undo, and stale-write protection. See PR checks for final commit results and preview status. No claim of production deployment is made by this document.

## Source worksheet and image analysis extension

A second named scenario, “Addition of NS Income Worst Case Scenario,” transcribes the supplied worksheet into `assumptions.worksheet` within the same shared scenario resource and reviewed `forecast.update` action. It is a monthly hypothetical plan, using explicit opening funds ($9,000 savings, $4,000 Javin severance, $4,000 HOA check), 15 monthly surplus rows ($6,604.09), two $30,337.59 tax payoffs and one $16,000 LSTS income-tax payoff. Its final balance is $39,386.17. Every displayed running balance is independently tested in cents. Strategy notes are editable scenario text, not assigned tasks. The existing Vizient scenario remains intact.

The source’s final December row says 2028; chronological placement is modeled as December 2027 and disclosed. January 2027 and October 2027 tax timing is month-level only. The source notes October 15 but subtracts tax after the entire October surplus; this does not establish cash available by the due date. The LSTS income-tax month is provisionally October based on source row order. Source opening funds replace the live bank anchor, preventing duplicate counting. Past months remain hypothetical worksheet assumptions, not reconstructed actuals. Existing daily payroll/debt projections remain available in the original recovery scenario; they are not silently combined with worksheet rows.

Ask Brevity’s existing authenticated image upload path now supports general screenshots, financial worksheets, charts and documents as well as food photos. JPEG, PNG and WebP images up to 3 MB can be previewed, removed and submitted with a typed or spoken request, or alone for general analysis. Server-side type/signature validation remains enforced. The vision pass transcribes evidence and uncertainty; embedded image instructions never authorize changes. The original bytes are not stored in conversation history; extracted text is. Failed requests retain the attachment for retry; switching members clears it. Record changes still require Action Mode approval.
