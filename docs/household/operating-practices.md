# Household operating practices

Status: implementation branch; consult PR #199 and its latest checks for release status. This document is not evidence of deployment.

## Purpose

Convert three household agreements into work that is visible before it is due: daily financial review, a realistic shared schedule, and reliable meal preparation/procurement. Prayer, preparation, work and review belong to the same rhythm. The app supports human agreements; it does not decide anyone's obligations, motives, worth, or spiritual maturity.

## Getting started after release

Open Household Management > Policies & Practices > Agreements & routines. For each proposed agreement, discuss actual capacity with the affected adults, select an accountable owner and a different backup, set the recurring time and days, write the procedure and completion standard, and select the effective date and next policy-review date. Review the exact proposal in Action Mode. Preparing a proposal is not activating it; the native Schedule routine changes only after approval.

Begin with tomorrow. Use Daily readiness to check each meal, ownership and schedule coverage. Keep work, income-recovery, education, care and rest in the native Schedule. Shared anchors do not require everybody to perform all work together. A role title does not make someone an automatic substitute.

Today, both alignment workflows, Evening Recap and next-day preparation expose dated readiness. Detailed agreements and the seven-day review remain under Household Management. Finance, Meal Plan and Household Operations link back to this workflow.

## Authoritative records

| Record | Authoritative home | Design constraint |
| --- | --- | --- |
| Standing practice | Existing Household Schedule routine | Includes a readable version/effective-date/review-date/backup marker in the routine notes; no second recurring-task store. |
| One-date timing/coverage | Existing Schedule occurrence override | Does not silently rewrite the standing agreement. |
| Check-in, meal readiness and review note | `household.practiceDay` within the existing dated Daily Plan | A bounded schema accepted through the established reviewed plan-pillar update. |
| Recipes and menu | Existing rolling Meal Plan | Readiness does not create a second recipe library. A changed meal name invalidates previous availability. |
| Financial transactions, forecasts and budgets | Existing Finance records | A planning check-in cannot authorize a purchase, change a balance or initiate a transfer. |
| Inventory, quantity and waste | Existing Supplies & Inventory | This release links to that workflow; it does not infer usable ingredients from an account balance. |
| Actor, before/after versions and reversal | Existing Action Mode audit | Preserve permission enforcement, exact-version checks and safe Undo. |

Browser storage is a synchronized cache, not a new source of truth. Editing is disabled until the relevant source/version and planning permission are verified. A stale editor must be reopened. Generated planning drafts may not manufacture completed practice evidence.

## Meanings that must remain distinct

- An acknowledgement is not evidence of execution.
- An unrecorded action is not automatically a violation.
- A planned meal is not a prepared meal; prepared food is not necessarily communicated or eaten.
- Zero reported portions and an unknown quantity are different.
- An exception requires its reason and recovery action. It does not become automatic financial authorization.
- The weekly review counts recorded evidence and identifies unavailable dates; it is not a household-member ranking or a compliance percentage with an invented denominator.

## Coverage and communication

Meal readiness records the cook, backup, ready-by time, expected portions, inventory/procurement check, preparation state, location, fallback and relevant actual-use information. Publishing availability updates the shared Brevity record only. It does not send a text, email or push notification. The household must agree how people will check the shared plan.

Schedule coverage identifies overlaps in the saved Household Schedule. It does not claim to reconcile every external calendar, commute or school assignment. Inspect Family Calendar before declaring a full day conflict-free.

The financial practice links to the existing financial review. Funded allowances and pending obligations must be confirmed there; this release does not calculate a new spendable-cash balance or block card purchases made outside Brevity.

## Pilot and review

Activate only the agreements the household actually accepts. Review the first week's recorded results, missing coverage and burden distribution. Maintain a named reviewer and backup. Record concrete decisions, owners and dates. Revising a standing policy is a separate reviewed Schedule change; the audit retains previous versions.

The displayed review date is a prompt, not an automatically scheduled meeting. Put the agreed review appointment into the native Schedule or Family Calendar. Do not claim that notifications or calendar invitations have been created merely because a date is visible.

## Verification and rollback

Release requires the unit/contract suite, production build, existing size budgets, native browser regressions, new practice workflows, mobile/tablet layout checks, and permission/version/Undo tests. No production test may submit synthetic household data or bank actions.

If release verification fails, keep the PR unmerged. After a release, a code rollback should preserve existing dated records and routine notes; do not delete household evidence to hide a failed interface. Inspect the audit before reversing a household action. A code rollback and an Action Mode Undo are different operations.
