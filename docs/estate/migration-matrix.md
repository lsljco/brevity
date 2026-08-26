# Malbec → Brevity migration matrix

Status values: `Not started`, `Foundation`, `In progress`, `Validated`, `Accepted`, `Retired`.

| Malbec capability | Current implementation | Brevity equivalent | Class | Target module | Migration / dependencies | Test requirement | Status |
|---|---|---|---|---|---|---|---|
| Command Center | Mixed live state and hard-coded cards | Today + pillar analysis | MERGE | Today | Surface only verified actionable Estate signals | Today prioritization and empty-state tests | Foundation |
| Dashboard | Duplicate household summary | Today | REPLACE | Today | No UI migration; map retained source records | Regression test Today sources | Not started |
| Property identity | Implicit Malbec-specific app | None first-class | ADD | Estate | Generic Property with household ownership | Multi-property isolation | Foundation |
| Property systems | Free-text maintenance categories | Rooms/types only | ADD | Estate Systems | Normalize categories; extensible system records | Category mapping and relationship tests | Foundation |
| Asset registry | No normalized asset lifecycle | None | ADD | Estate Assets | Extract equipment, manuals, warranties and history | Relationship, lifecycle and duplicate tests | Foundation |
| Maintenance list | LocalStorage maintenance array | HomeHQ Maintenance | IMPROVE | Estate Maintenance + HomeHQ | Transform into WorkOrders linked to systems/assets | Status mapping, counts, idempotency | Foundation |
| Preventive maintenance | Generic maintenance items | Generic HomeHQ item | ADD | Estate Maintenance | Plans generate events/work orders and next service | Recurrence and state-machine tests | Not started |
| Maintenance history | Overwritten current records mixed with code defaults | Notes/project history only | ADD | Estate Maintenance | Preserve completed events and source metadata; explicitly import/exclude exact seed matches | Historical count/field/seed reconciliation | In progress |
| Projects | Local project array and milestones | HomeHQ projects/Gantt/RACI/costs | MERGE | HomeHQ + Estate dimensions | Adapt shared project architecture; attach property/system/assets | Project bridge and regression tests | Foundation |
| Project milestones | Embedded arrays | HomeHQ dates/Gantt | IMPROVE | HomeHQ | Normalize milestones and retain legacy order | Timeline mapping | Not started |
| Contractors | Repeated fields per item | Derived HomeHQ contractor list | IMPROVE | Estate Vendors | Deduplicate reusable Vendor/Contractor records | Match/merge and compliance tests | Not started |
| Licenses/COI/WC | Booleans on project | HomeHQ booleans | IMPROVE | Vendors + Documents | Store evidence, issuer and expiration dates | Expiration and document-link tests | Not started |
| Supplies purchasing | Browser list | Household operations | MERGE | Household | Retain property-specific consumables; avoid assets for disposables | Classification tests | Not started |
| Supplies inventory | Browser quantities | No durable equivalent | IMPROVE | Household / Estate | Property parts may link to system; general supplies remain Household | Quantity and category reconciliation | Not started |
| Calendar | Browser events + CalDAV | Family Calendar | REPLACE | Family Calendar | Selectively reconcile; use Brevity auth/source IDs | Duplicate, timezone and CRUD tests | Not started |
| iCloud sync | PIN cookie, wildcard CORS, legacy CalDAV | Authenticated Brevity CalDAV | REPLACE | Family Calendar | Preserve data, retire implementation after validation | Live sandbox integration suite | Not started |
| Document Vault | Mostly static categories/local files | HomeHQ file fields, sermon document stores | ADD | Estate Vault | Typed PropertyDocuments, authenticated downloads, durable content-addressed binary storage and entity relationships | MIME, permission, chunk, hash and relationship tests | In progress |
| Photos | Embedded data URLs | HomeHQ embedded files | REPLACE | Estate Documents | Extract browser-session payloads; verify legacy checksum/size and SHA-256; persist without duplicating bytes in workspace | File-count/hash/download/relationship validation | In progress |
| Warranties | Vault/category references | None first-class | ADD | Estate Warranties | Link asset/vendor/document; expiration alerts | Expiry and relationship tests | Not started |
| Utilities | Household/static content | Finance recurring data only | ADD | Estate Utilities | Account/service metadata; costs link to Finance | Account permission and transaction-link tests | Not started |
| Insurance | Vault/category references | Finance documents only | ADD | Estate Insurance | Policies/claims linked to property/assets/docs/expenses | Renewal, claim and permission tests | Not started |
| Property expenses | Malbec finance duplication | Finance & Stewardship | MERGE | Finance | Add Property → System → Asset → Project → Vendor dimensions | No-double-counting and rollup tests | Not started |
| Budget observations | Dashboard values | HomeHQ costs + Finance | MERGE | Finance / HomeHQ | Reconcile project budgets; Finance remains ledger | Rollup and variance tests | Not started |
| Risks/issues | Command-center seed/state | Today/Pillar analysis | IMPROVE | Estate Command Center | Derive from overdue work, project variance, claims and inspections | Actionability/freshness tests | Not started |
| Decisions | Command-center record | Brevity decisions | MERGE | Household Decisions | Link Estate context; use Needs Decision/Determined/Complete/Deferred | Status/link regression tests | Not started |
| Reports/analytics | In-browser calculations | Pillar analysis + Finance reporting | MERGE | Estate Reports | Server-derived metrics from canonical records | Formula and freshness tests | Not started |
| Archive | Local archive screen | No Estate archive | ADD | Estate | Soft archival with actor/reason/timestamp | Restore and audit tests | Not started |
| Settings backup export | Prefix-based localStorage JSON | Browser export + server stores | REPLACE | Settings / Estate admin | Compare exports from every device; block missing/divergent property records; verify payload/count integrity; download reconciliation report; preserve originals | Multi-device conflicts, duplicate, checksum, count and no-mutation tests | Validated |
| Spiritual domain | LocalStorage module | Spiritual Maturity | RETIRE | Spiritual | Reconcile user-created records only; no Estate rebuild | Record-count reconciliation | Not started |
| Health/nutrition | LocalStorage module | Health & Nutrition + Meals | REPLACE | Health | Reconcile genuine historical records | Domain regression tests | Not started |
| Fitness | LocalStorage module | Physical Fitness | REPLACE | Fitness | Reconcile genuine historical records | Domain regression tests | Not started |
| Education | LocalStorage module | Education | REPLACE | Education | Reconcile genuine historical records | Domain regression tests | Not started |
| Finance module | Duplicate local ledger/plans | Finance & Stewardship | REPLACE | Finance | Reconcile only records absent from Brevity | Balance and transaction reconciliation | Not started |
| Ministry | LocalStorage module | Ministry & Fellowship | REPLACE | Ministry | Reconcile genuine historical records | Domain regression tests | Not started |
| Theme/design | Standalone UI | Brevity design system | RETIRE | Application shell | No migration | Visual regression | Foundation |
| Legacy production | Standalone Netlify site | Native Estate route | RETIRE | Operations | Only after acceptance, backup, freeze and rollback window | Production acceptance checklist | Not started |

## Reconciliation columns required for each import run

Every run must record source export ID and hash, export timestamp, source device, source count, transformed count, imported count, skipped count, duplicate count, warning count, file count/hash totals, relationship failures, target workspace version, actor, and acceptance state.
