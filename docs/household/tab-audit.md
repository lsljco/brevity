# Brevity household-fit audit

Audit date: 2026-09-19. Scope: source-level navigation and integration review for the household operating-practices release, plus automated checks reported by PR #199. This is not a certification that every production record, calculation, integration, image or member account has been manually verified.

## Acceptance standard

Each screen should answer an actual household question, identify the source and date of the information, provide a useful next action, preserve permissions, and avoid making people re-enter information that an authoritative record already supplies. Navigation success is not proof that a financial calculation or real-world task is correct.

## Route assessment

| Area / tab | Household need | Finding and release treatment | Verification still required |
| --- | --- | --- | --- |
| Today | See the day and unresolved coverage, not generic advice. | Adds dated household readiness and direct links; preserves Seven Pillars and existing actions. | Phone hit targets, reading order, scroll and coexistence with native meal/action cards are release gates. |
| Today's Alignment | Confirm today's responsibilities without changing tomorrow. | Shows the current date's practice and meal records; existing reviewed alignment remains. | Native browser test must distinguish today/tomorrow and retain access to action buttons. |
| Tomorrow's Alignment | Prepare before hunger, deadlines or uncovered tasks arise. | Uses tomorrow's plan and meal source, not today's check-in state. | Verify loaded date, source failure and concurrent-version behavior. |
| Evening Recap / next-day preparation | Close unresolved work and prepare the next day. | Adds the corresponding date's readiness around the native workflow. | Check no duplicated completion or silently carried-forward success; retain existing closeout tests. |
| Spiritual Maturity | Shared prayer/devotion and practical application. | Existing shared-pillar behavior retained; the new practices use prayer/preparation/work/review language, not a spirituality score. | No claim of a new devotion engine or individual spiritual assessment. |
| Health & Nutrition overview | Connect nourishment to actual meals. | Existing analysis remains; explicit meal readiness is available in the practice workspace. | Analysis must not treat a menu as proof of preparation, intake or nutritional adherence. |
| Meal Plan | Recipes, ingredients and a usable rolling menu. | Remains recipe/menu authority; links to owners, timing, inventory and preparation coverage. | Full recipe completeness, image quality, macros and every library entry were not re-certified by this audit. |
| Physical Fitness | Concrete daily workout and executable weekly training. | Existing routed workout implementation retained; not replaced by generic policy advice. | Exercise image quality, form guidance and complete routine execution require their own content QA. |
| Household Management overview | One location for shared operations. | Adds Policies & Practices under the existing pillar. | Avoid presenting a second standalone planner. |
| Household Intelligence | Separate planned allocation from reported achievement. | Existing intelligence retained; no new invented adherence percentage or member ranking. | Full production reconciliation of calendar coverage and scores is not certified here. |
| Policies & Practices: Daily readiness | Know the owner, time, next action and gap. | New coordinated practice/meal readiness plus saved Schedule coverage. | External calendars, automatic allowance reconciliation and notifications remain explicit boundaries. |
| Policies & Practices: Agreements & routines | Activate an agreement rather than archive it. | Creates or revises native Schedule routines through Action Mode, with owner, backup, procedure, version and review date. | Actual household consent and a feasible time allocation are human decisions, not inferred defaults. |
| Policies & Practices: Weekly review | Examine reported work and repeated obstacles. | Seven dated records, missing-source handling and reviewed decision notes. | A displayed review date does not create a calendar appointment or notification. |
| Schedule | Protect employment, learning, care and rest. | Direct navigation now selects Schedule; living-practice effective dates respected. | Full cross-calendar/travel conflict detection remains outside this release. |
| Routines | Reuse recurring commitments without duplicating calendar records. | Standing practices reuse existing routine storage and occurrence overrides. | A generic routine editor must preserve the policy marker or the agreement can need repair. Dedicated policy fields would remove this encoding dependency. |
| Operations | Work assigned, completed and appropriately verified. | Removes hardcoded availability assumptions from guidance; preserves actual assignments, checklists and reviewer controls. | Previously assigned duties remain until explicitly reviewed. This release does not declare them fair or feasible. |
| Supplies & Inventory | Buy what is needed and reduce waste. | Readiness links directly to the native inventory tab; its reviewed quantity/waste operations remain. | Ingredient quantities, units, procurement ownership and automatic shopping-list reconciliation are not fully automated by this change. |
| Family Calendar | See shared commitments without duplicated copies. | Native Schedule read-time projection preserved; no second calendar write introduced. | External calendar account coverage and read-only feeds require live-data verification. |
| Projects | Manage bounded household/property work. | Existing reviewed project permissions retained. | Unsupported imports/files/bulk calendar publication must not be silently enabled. |
| Malbec Estate | Property operations with clear ownership of records. | Existing integration retained; not removed while functionality may still be needed. | Sunset requires a separate migration and reconciliation, not a navigation rename. |
| Live Intentional | Avoid competing current-day planning systems. | Description identifies it as a legacy reference and directs current commitments to native Schedule/practices. | Legacy service retirement is not performed in this release. |
| Education | Protect individual study and child learning support. | Existing routed tutor implementation retained; Schedule provides time/coverage planning. | The app cannot infer coursework completion or supporting-adult consent from a calendar block. |
| Finance: Dashboard | Know actual, forecast and spendable funds distinctly. | No monetary calculation changed by a practice check-in. | Production cash/income/drill-down totals need source-account reconciliation; this audit does not certify all figures. |
| Finance: Meetings | Conduct and record the daily financial review. | Direct finance-practice destination; planning and financial permissions remain separate. | No automatic claim that a completed check-in means every transaction was reviewed. |
| Finance: Transactions | Review actual posted spending and correct categories safely. | Context link to the practice and existing reviewed corrections retained. | Account-purpose exception detection before purchase is not a card control; posted imports may lag. |
| Finance: Cash Forecast / Scenario Modeling | Understand upcoming obligations and uncertainty. | Existing authoritative calculations retained, not duplicated in readiness. | Pending items, transfer semantics, assumptions and timeframe completeness require dedicated finance QA. |
| Finance: Accounts / Debts / Budget / Recurring / Reporting | Preserve financial administration and source traceability. | Existing admin restrictions retained; Budget links to practice. | The readiness feature does not authorize bank connections, payments, transfers, debt actions or new spending. |
| Ministry & Fellowship / Sermon Builder | Support preparation without consuming every other pillar. | Existing account-scoped resources retained. | Time boundaries must be scheduled; this release does not change sermon ownership or sharing. |
| Settings / recovery | Clear permissions, sync and recovery boundaries. | Schedule added to the existing local recovery-cache export. | A browser-cache export is not a complete backup of server-held Daily Plans and audit records. No unsafe restore is introduced. |

## Priority follow-through

1. Release blockers: no navigation/action overlay regressions; fresh authoritative dates; all permissions/version/Undo tests; all existing and new browser tests. Keep the change off production until these pass.
2. First household activation: agree on three routines and coverage, then prepare a real next day. No default bulk assignments or account movements.
3. Integration depth still needed: explicit reusable weekly-review appointment; automatic funded-allowance/pending-obligation display from Finance; structured procurement/cleanup ownership and ingredient-to-inventory reconciliation; externally delivered notifications only through an authorized channel.
4. Data/content audits still needed: financial source reconciliation, external calendar completeness, full meal/exercise library quality, and Household Intelligence actual-versus-planned reconciliation. A successful route smoke test must not be presented as completion of these audits.

## Test evidence location

See the exact commit's `Brevity verification` and `Brevity browser regression` workflow runs. Unit, contract and integration tests include the practice schema, generated-draft rejection, changed-menu invalidation, effective-date projections, owner overrides, permission denial, stale-version rejection, audit and Undo. Browser tests exercise agreement setup, permission-gated viewing, dated readiness, recovery records and native destinations at configured desktop/phone/tablet sizes.

A passing build is not a production deployment. Verify the merged commit and hosting deployment separately; do not test by modifying real household records.
