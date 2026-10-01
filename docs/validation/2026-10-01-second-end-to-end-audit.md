# Second end-to-end audit — October 1, 2026

Baseline: main `25c915fc79242e4550a6d29356f5eb2bd5b386a7` (PRs #260 and #261). Continues the prior audit; Health device acceptance and household pilot observation remain explicitly deferred.

## Findings corrected

- Next 7 Days previously requested meal balancing for “today.” It now passes the authoritative selected meal-day record to the shared meal panel and includes that exact date in the assistant request. Proposed changes still require Action Mode review.
- Next 7 Days calendar verification previously only recalculated when the calendar object changed. It now uses the same aging/focus/visibility health hook as Today and Family Calendar.
- Next 7 Days chores previously memoized only on the selected date. Shared maintenance updates and cross-tab storage updates now refresh the projection, including edits, deletions, and completions, without changing the selected day.
- Replaced pptxgenjs's vulnerable transitive image-size 1.2.1 with the published 2.0.4 package through a scoped npm override. Removed the expiring high-severity audit exception. The gate rejects all high/critical advisories and fails closed when npm cannot return a complete audit report.

## Local verification

- 1,300 unit/server tests passed, including complete sermon slide package generation/download and dependency-gate failure cases.
- Eight new browser checks passed across desktop, iPhone, iPad portrait and landscape: selected-date assistant handoff, shared-source chore additions/removals while open, and time-based calendar freshness.
- Production build, source/bundle budgets, and production dependency audit passed. npm audit --omit=dev reported zero vulnerabilities.
- Lockfile changes are limited to image-size 2.0.4 and removal of its obsolete queue dependency.

## Review scope and production observations

The previous full audit's permission, stable-ID, Action Mode, safe Undo, Plaid recovery, finance-source, and Seven Pillar coverage remains applicable; this pass concentrates on future-day projections and dependency/export compatibility and reruns release CI.

Signed-in production inspection reconfirmed the completed bank refresh without a retained error banner; Today macro totals and both snacks; explicit missing-goal handling; snack swap review/cancel; personal/ministry calendar selection; and Education navigation. No production household records or nutrition targets were changed for test purposes. All mutations used isolated automated fixtures.

Full pull-request CI and deployment results are recorded in the associated PR and final delivery. Device acceptance, the household pilot, and optional preview-only model acceptance requiring a separate login are not represented as completed.
