# Finance coverage and assistant upgrade acceptance plan

Status: initial budget transparency and glass changes implemented on this branch. The assistant upgrades below are requirements, not completed functionality.

## Finance reporting contract

Every result must identify account scope, period, pending treatment, transfer treatment and source freshness. Account ownership must not be inferred from an institution name. Unknown account ownership is an exception, not permission to include personal spending in household totals.

Operating distributions to adult personal accounts are Dividend Expense in the household management view. Personal balances and subsequent spending are outside household reconciliation. Prevent double counting by separating this management treatment from consolidated inter-account transfer accounting. Existing generic transfer matching must be reviewed before declaring the household surplus accurate.

Show both expense reporting and a bank-cash bridge. A card payment can reduce Operating cash while being excluded from expense reporting; counting purchases and their settlement twice is also incorrect. Tie beginning bank cash, posted signed movements and ending bank cash to authoritative snapshots. Pending holds must not be subtracted twice. Missing source coverage must remain unknown, never zero.

## Ask Brevity upgrade

The existing implementation already uses OpenAI's Agents SDK. Its compact server finance context emphasizes recurring records, budgets, forecasts, overrides and rules. Browser transaction samples and short recent-message windows are not a complete financial ledger.

Required server tools:

1. Query authorized posted/pending transactions with pagination, stable IDs, account scope and coverage metadata.
2. Obtain balances, statements, due dates and minimum payments with source timestamps. Return missing fields explicitly.
3. Calculate deterministic budget totals, cash bridges, variance and forecast scenarios outside model-generated arithmetic.
4. Explain every result with drill-through evidence and inclusion/exclusion reasons.
5. Prepare, edit and regenerate daily, weekly, monthly, quarterly and annual meeting packets from the same calculations.
6. Prepare assignments, budget corrections and reconciliation proposals through existing reviewed action execution. Return saved record IDs and completion receipts. Never claim a task was completed merely because text was generated.
7. Retain conversation continuity and user-reviewed household preferences server-side, respecting membership permissions. Existing ChatGPT conversations are not automatically inherited.

## Acceptance cases

- Explain an expense total and enumerate excluded rows without sample truncation.
- Distinguish Operating-only from All, unknown ownership and personal accounts.
- Answer why expected surplus differs from realized household cash using evidence.
- Treat one personal distribution once as Dividend Expense, excluding later personal spending.
- Surface an unexpected creditor withdrawal and refund as separate dated events.
- Generate an executive meeting brief with decisions, owners and deadlines; preserve underlying accounting detail for drill-through.
- Read requests cannot mutate records. Approved writes are authorized, idempotent, logged and verifiable.
- Failed data retrieval yields an explicit incomplete answer, not an invented balance.
- Long conversations preserve relevant decisions without exposing another household's data.

## Visual acceptance

Use approximately 35% charcoal glass backgrounds on primary cards, full-opacity readable text, gold accents, blur and subtle borders. Check desktop and tablet, keyboard focus, expanded coverage detail and all five meeting cadences. Reduced-transparency preferences receive opaque surfaces.

## Remaining verification

The initial branch does not alter bank permissions, send payments, resolve unknown account ownership, change transaction classifications or upgrade the assistant tools. Production integration, visual browser verification and the full finance control contract remain outstanding.

## Transaction workspace reference requirements

Reference: user-provided Monarch transaction list, detail and merchant history screenshots.

- Sort by Amount (absolute magnitude), Vendor, Description or Date, each direction.
- Explicit All bank transactions, Posted Bank Activity and Scheduled views; category selector includes Uncategorized. Scope and available history must be visible.
- Transaction details: merchant identity, original immutable bank description, amount and posted/pending state, account, category, goal, date, notes and tags.
- Vendor history: clickable record count and other posted expense count, monthly expenses, average expense, credits and trend visualization. All-history labels refer only to available imported records within the authorized account scope.
- Preserve bank-supplied merchant identity independently of raw statement text. Reviewed vendor links override automatic labels. Unknown merchants must not be invented or confused with the bank/payment intermediary.
- Pending-to-posted lineage must eliminate lifecycle duplicates from history. Never infer duplicate identity from equal amounts alone.
- Category corrections and vendor corrections are separate operations. Rules must state whether they affect this record, matching history or future transactions.
- Keep personal-account activity outside household totals by default.

Initial implementation includes sorting, category filters, bank-supplied merchant display and an expandable history table. Existing imported rows without merchant metadata require a subsequent sync or a reviewed vendor link. Editable notes/tags/goals, vendor alias management, a monthly trend chart, and desktop/tablet visual verification remain unfinished. These must not be described as shipped parity with the reference.

## Release audit update

The staging browser audit verified all five meeting cadence selectors, the daily earliest-due priority table, expanded budget coverage, category filtering, vendor sorting, and the posted-only transaction view. Desktop glass cards were visually inspected without overlap. Staging has no connected bank transaction history, so live balances, merchant history populated from real records and household surplus remain unverified.

The audit also found that Budget could present zero actuals when no bank snapshot existed. The release now suppresses actual spending, remaining budget and spending percentages in that case while preserving Plan Grid access. A successfully refreshed empty snapshot still represents zero activity; retained stale records remain visible with their freshness warning.

## Completion release

Implemented in the completion release:

- Server-authorized full-ledger assistant queries with complete totals before pagination, stable snapshot checks, exact account scope, posted/pending separation, missing-source handling and billing/meeting/control modes.
- Reviewed transaction notes, tags, goal labels and Dividend Expense management classification, with the existing version check, audit and Undo. Original bank facts remain immutable.
- Merchant monthly chart, expense counts and navigation; reviewed exact aliases apply to historical and subsequent imported records. Ambiguous aliases remain unassigned.
- Vendor statement date, payment due date, minimum due, statement balance and autopay setting. Missing values remain unknown, and protected credential storage stays separate. Assistant billing access respects vendor membership and never returns secrets.
- Operating-only household accountability excludes subsequent personal-account spending. Dividend distributions count once in the management view and still retain their original cash movement.
- Operating controls surface dining indicators, unmatched transfers/settlements and uniquely matched payment amount differences. Credits remain separate evidence rather than assumed refunds. Meetings include these controls and follow-up proposals without requiring line-item discussion.
- Existing automatic reconciliation, reversible categorization, executive packets across five cadences, reviewed assignments, conversation history and household preference tools remain in place.

External facts and bank configuration remain evidence dependencies: current creditor statements, confirmed personal-account recipients, draft authorizations, bank notification settings and Friday transfer instructions. Software does not assert these are configured or execute bank payments. Source freshness and reconciliation gaps remain visible rather than silently certified. The monthly allowance must use the actual number of Fridays and confirmed eligible adults.

Validation includes permission-denied queries, full-ledger pagination, unknown-versus-zero billing, alias ambiguity, personal-spending exclusion, reviewed metadata with Undo, browser layouts and production deployment checks. No private live financial records are included in test fixtures or this release documentation.
