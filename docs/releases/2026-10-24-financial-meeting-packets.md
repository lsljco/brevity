# FIN-001 meeting packets

Finance → Meetings now assembles Daily, Weekly, Monthly, Quarterly and Annual report packets from the selected Finance accounts, retained bank activity, saved budget targets, scheduled obligations and shared meeting commitments. Use Last completed period for close reviews or Current period to date for operational reviews. The packet updates as Finance data changes and advances its household date while open.

Each packet contains the FIN-001 agenda and duration, required inputs, deliverables, source status/check timestamps, posted results and prior-period comparison, pending transactions, category budget comparison, monthly results, projected payables, credit account summary, budget milestones and open actions. Q3 following-year proposal submission remains due September 30, with final approval October 31. Agenda minute allocations are suggestions within each mandated duration.

Download packet exports the current report as text. Review & archive packet uses the existing version-checked Action Mode confirmation. The saved report text is preserved exactly, separately from editable meeting summary/notes, and displayed in Meeting History. It is included in the existing audit and Undo path. Archiving records a report snapshot; it does not certify reconciliation, payment, budget approval or a completed meeting.

## Financial interpretation

- Household income and expense reporting excludes transfers and credit-card payments. Selected cash coverage in the pre-existing operational cards continues to include transfers crossing the selected cash boundary. Those cards retain their separate cash-scope labels.
- Posted, pending and scheduled/projected records are presented separately. Pending rows replaced by an explicitly linked posted transaction are suppressed. Pending and projected obligations are not added together because unreconciled overlap may exist.
- Only unique local-to-bank account links qualify transaction totals. No account-name matching or fabricated balances. Cash balances are labeled stored and carry the supplied source status.
- A fresh source check does not establish full historical coverage. Close approval requires complete statement reconciliation and communication to governing members. Missing prior-period activity stays unavailable.
- Budget comparisons use saved monthly category targets for months touched by the report, without daily/weekly proration. No recurrence-derived plan is substituted for an absent budget target. Missing targets stay unavailable, including when only some line-months have targets.
- Governing-member behavior explanations, insurance/investment review, reserve certification, individual payoff targets and evidence of budget approval remain review inputs. The packet exposes these requirements rather than generating unsupported conclusions.
- Actions continue to use the existing shared register and Family Calendar. Missing owners/deadlines are flagged; packet preparation creates no duplicate commitments.

## Operation and rollout

Packets prepare without filling forms. The page immediately calculates feedback, direction, risk explanations and proposed commitments with owners/deadlines. Saved schedules automatically provide a separately labeled planning baseline when approved budget targets are missing. This does not invent an approved budget.

The authenticated report endpoint loads financial facts from shared household storage and applies saved report edits before analysis. It reuses the deployed `OPENAI_API_KEY` / `BREVITY_AI_MODEL` connection, caches analysis by evidence, and prevents concurrent duplicate calls with a bounded lease. Missing credentials or an unavailable AI service leave useful calculated feedback visible and retry automatically. A response based on different financial facts is not displayed as analysis of the current report.

A protected background job prepares all five cadences for current and previous periods at 5:00 AM America/New_York. The scheduled UTC pair and local-hour guard cover daylight/standard time. Preview deployments skip scheduled dispatch. This job reads existing synchronized financial records; it does not create bank connections, request paid transaction refreshes, execute payments or deliver messages to others. A failed/stale bank sync remains visible as a source issue.

The existing bank-sync and shared-state paths supply household data. No additional daily data-entry requirement is introduced. Live deployment must have the existing AI and automation credentials available; local tests use injected services and synthetic reports, not household banking credentials.

## Optional household edits

Edit report, insights or numbers opens a populated field selector. Notes, summary, direction, insights, proposed actions, narrative warnings and reported financial figures can be changed, including unknown values and zero. Choose one report period or the cadence going forward. Restore automatic value removes the selected override. Array rows use stable identities so a removed obligation's edit cannot move to a different bill.

`meeting.packet.edit` uses the existing administrator financial permission, exact shared-state version check, Action Mode review, immutable before/after audit and Undo. Edits persist across refreshes in the shared meeting record. They adjust the reported household view; source bank records remain intact. Current source and overridden values are shown in the report. Component edits recalculate dependent net, category remaining amounts, monthly net, card utilization and analysis. Explicit total overrides remain independent and visible as adjustments.

Suggested commitments can be reviewed into the existing action register without retyping. The narrative advice and proposed commitments remain editable. Generation does not mark actions complete, approve budgets or certify closes. Downloaded and archived packets include the effective analysis, notes and adjustment provenance.

Source basis: user-specified FIN-001 durations and reporting distinctions; accessible `LSLJ HFOS v2 05 20 2026.docx`, revised May 20, 2026, including the financial meeting cadence, HFOS reporting standards and annual budget timeline. The separate cadence document and prior assistant responses were unavailable. No private household balances are committed in this change.

## Verification

Domain tests cover household dates, reporting periods, transfers, superseded holds, missing versus zero inputs, links, source aging, budget targets, action carry-forward, calculated recommendations, override persistence/reset, row identity, AI caching/failure, authorization and morning scheduling. Review tests verify snapshot retention and numeric overrides with audit/Undo. Browser checks exercise all five cadences, prepared insights, number-edit review (including zero), period selection, download and phone layout using synthetic data. Live AI availability and deployed schedule execution require deployment verification.
