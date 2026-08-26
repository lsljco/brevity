# Malbec Estate forensic audit

Status: Phase 1 baseline, 2026-08-26  
Governing specification: Brevity issue #27

## Executive finding

Malbec Estate Household OS is not a focused property application. It is a 14.7 MB, single-page household operating system whose spiritual, health, fitness, education, finance, ministry, calendar, meeting and household-planning capabilities substantially overlap Brevity. Its valuable property content is concentrated in maintenance, projects, selected supplies, selected calendar records, documents, and a small number of command-center risks and decisions. Those records should be transformed into Brevity entities; the application itself should not be transplanted.

## Source inventory

The private source repository contains four operational artifacts:

- `index.html`: 14,711,277-byte monolith, 19,582 lines, including markup, styles, application logic, seed records and embedded media.
- `netlify.toml`: static deployment and function configuration.
- `netlify/functions/icloud-calendar.mjs`: Apple CalDAV CRUD and PIN-based legacy access.
- repository metadata and deployment configuration.

The monolith contains 42 embedded images (41 JPEG and one PNG) and roughly 828 KB of application code and markup after embedded data URLs are removed. The largest script is approximately 682 KB and contains more than 500 functions.

## Screens and workflows

Observed first-class pages include Command Center, Dashboard, Calendar, Meetings, Household, Supplies, Maintenance, Projects, Spiritual Maturity, Physical Fitness, Nutrition, Education, Finance, Ministry & Fellowship, Document Vault, Analysis, Archive and Settings.

Property-relevant workflows are:

- Maintenance intake and stage tracking.
- Project tracking with milestones and ownership.
- Supplies purchasing and inventory.
- Calendar scheduling.
- Command-center risks, decisions, budget observations and recent wins.
- Static document-vault categories.
- JSON browser backup and restore.

The remaining screens duplicate domains already owned by Brevity and should be reconciled into those domains rather than rebuilt in Estate.

## Data and persistence

Malbec persists application state exclusively in browser `localStorage` through a `usePersistentState` wrapper. Keys use the `malbecHOS_` prefix. Sixty persistent records were identified across calendar, education, finance, fitness, health, household, maintenance, ministry, nutrition, spiritual, supplies and theme groups.

Property-adjacent keys are:

- `malbecHOS_maintenance_maintenance`
- `malbecHOS_maintenance_projects`
- `malbecHOS_maintenance_quickActions`
- `malbecHOS_supplies_inv`
- `malbecHOS_supplies_purch`
- selected records within `malbecHOS_calendar_evs`
- selected property-relevant household records after manual reconciliation

The maintenance seed schema is `id`, `title`, `desc`, `cat`, `owner`, `stage`, `scheduledDate`, `updated`, and `updatedBy`. The project seed schema is `id`, `title`, `desc`, `cat`, `owner`, `status`, `currentMilestone`, `milestones`, `doneCount`, `updated`, and `updatedBy`.

No durable database, household-scoped authorization, record-level audit log, normalized relationship model, attachment store, or server-side backup mechanism exists in Malbec.

## Integrations

The only observed application API integration is `/.netlify/functions/icloud-calendar`. The legacy function performs broad CalDAV queries and CRUD, uses a PIN cookie rather than Brevity household identity, permits wildcard CORS, and carries legacy categories. Brevity's authenticated calendar implementation is the surviving architecture. Malbec calendar records require selective reconciliation, but its authentication and sync implementation should be replaced.

## Brevity destination assessment

Brevity already owns:

- HomeHQ projects, renovation, maintenance, repair, rooms, status, priority, RACI, costs, contractor fields, compliance indicators, notes, photos, files, Gantt and Family Calendar publishing.
- Authenticated household identity and roles.
- Family Calendar and Apple CalDAV integration.
- Finance & Stewardship and Plaid-backed transactions.
- Household people, Today, decisions and analysis.
- Assistant context and server-authoritative sources.
- Strong-consistency Netlify Blobs repositories for several durable domains.

HomeHQ currently stores its canonical project payload in `homehq_items_v1` browser storage and synchronizes the serialized record through a household state compatibility service. That prevents immediate loss but is not a normalized, auditable Estate system of record. It must be adapted to the Estate repository before critical property records move.

## Risks

| Risk | Severity | Required control |
|---|---:|---|
| Browser-only legacy data can differ by device | Critical | Collect exports from every used device; hash and compare before transform. |
| Embedded files can exceed function request limits | Critical | Extract a file manifest and upload binaries through a dedicated document pipeline; never embed them in Estate JSON. |
| Malbec seed values may appear to be user history | High | Distinguish code defaults from exported live records during reconciliation. |
| Repeated import can duplicate records | High | Deterministic target IDs plus legacy source ID/checksum. |
| HomeHQ local data could be overwritten | Critical | Estate import never writes `homehq_items_v1`; use a later reviewed bridge with explicit reconciliation. |
| Calendar duplication | High | Match by legacy ID, dates, title and source metadata before publishing. |
| Contractor duplication | High | Resolve to reusable Vendor records before project linking. |
| Financial double counting | High | Link to Finance transactions; do not create a second ledger. |
| Private documents and credentials | Critical | Authenticated endpoints, server-side secrets, typed document permissions and no secrets in exports. |
| Partial multi-record imports | High | Versioned aggregate import, immutable backup, audit record and count reconciliation. |
| Premature legacy shutdown | Critical | Keep Malbec writable until acceptance; read-only and sunset are separately approved phases. |

## Phase 1 boundary

This increment introduces the durable Estate contract and non-destructive structured-data transformer. It intentionally does not import files, publish calendar records, alter Finance, overwrite HomeHQ, or change Malbec production. Those actions require later reconciliation gates.
