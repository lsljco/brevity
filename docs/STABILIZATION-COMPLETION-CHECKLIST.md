# Brevity operational completion gates

Brevity is considered operational only when the following contracts remain true in automated verification.

- Today is a seven-pillar executive view, not a duplicate operating workspace.
- Household Management owns Schedule, Routines, Operations, Inventory, Estate, Projects, and Family Calendar.
- Shared household records write through to the authenticated household-state service; localStorage is a recovery/offline cache.
- Finance uses the canonical Finance domain model for meeting metrics and all new financial metrics. Transfers never count as operating income or expense.
- Daily household plans are generated automatically by the scheduled 4 AM household workflow and Morning Alignment acts as an override/exception layer.
- Scheduled chores require completion submission and verifier sign-off when configured.
- Sermon uploads are represented as one durable workflow with documents, publishing, slides, visuals, devotions, and completion stages. Transient publishing failures retry automatically.
- Application refresh retries transient Finance, Today, and Family Calendar failures automatically and preserves last verified information where supported.
- Deprecated My Planner navigation may not return.
- Shared Spiritual Maturity remains household-scoped rather than member-owned.
- Desktop and iPhone browser regression suites must pass before merge.
- No pull request may merge when unit tests, production build, browser regression, or Netlify deploy preview is red.

Technical debt such as component-size reduction is tracked separately from operational correctness and may not be used to justify conflicting calculations, stale data, or manual reconciliation requirements.
