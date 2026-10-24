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

This change reuses Brevity's existing bank-sync and shared-state paths. It introduces no bank credentials, new provider connections, paid bank-refresh requests, AI calls, independent background scheduler or new notification channel. Packets prepare on opening Finance Meetings and recompute from arriving source updates. Unattended overnight bank refresh and scheduled delivery are separate operational work requiring verification of the deployed household configuration.

Source basis: user-specified FIN-001 durations and reporting distinctions; accessible `LSLJ HFOS v2 05 20 2026.docx`, revised May 20, 2026, including the financial meeting cadence, HFOS reporting standards and annual budget timeline. The separate cadence document and prior assistant responses were unavailable. No private household balances are committed in this change.

## Verification

Domain tests cover household date boundaries, completed/current periods, transfers, replaced pending charges, missing versus zero inputs, duplicate account links, source aging, budget targets and action carry-forward. The reviewed archive test checks exact text retention above the normal notes limit, immutable snapshot fields, size rejection, audit and Undo. Browser coverage exercises all five cadences, period selection, populated posted/pending/projected sections, download and responsive overflow using synthetic data.
