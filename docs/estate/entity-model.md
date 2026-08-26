# Estate canonical entity and persistence model

## Ownership and relationships

`Household` owns one or more `Property` records. A Property owns `PropertySystem` records. Assets belong to a Property and normally one PropertySystem. Operational and financial entities reference stable IDs rather than copying names or vendor details.

```text
Household
└── Property
    ├── PropertySystem ── Asset ── Warranty
    │                         ├── MaintenancePlan ── MaintenanceEvent / WorkOrder
    │                         └── PropertyDocument
    ├── PropertyProject ── milestone / inspection / document / expense links
    ├── Vendor ── Contract ── document links
    ├── Utility
    ├── InsurancePolicy ── InsuranceClaim
    └── PropertyExpense ── Finance transaction reference
```

Documents use polymorphic relation descriptors so one document can be linked to property, system, asset, project, vendor, contract, warranty, policy, claim, inspection or work order without copying the binary.

## First-class records

- `Property`: household ownership, name, address, timezone and lifecycle state.
- `PropertySystem`: extensible category/name, condition and hierarchy.
- `Asset`: manufacturer/model/serial, location, install/purchase/replacement data and system/vendor references.
- `MaintenancePlan`: recurrence, asset/system, responsibility, vendor and expected cost.
- `MaintenanceEvent`: generated occurrence and completion/service facts.
- `WorkOrder`: due/scheduled/in-progress/completed/cost-recorded workflow.
- `Vendor`: reusable company, contacts, trade, credentials and service history links.
- `Contract`: vendor/property/project relationship and terms.
- `Warranty`: coverage, expiration, provider, asset and documents.
- `PropertyProject`: property dimensions attached to Brevity's shared project capability.
- `Inspection`: inspector, scope, findings, decisions and documents.
- `Utility`: provider/account/service metadata; monetary facts remain in Finance.
- `PropertyDocument`: metadata, binary reference, hash and typed relationships.
- `InsurancePolicy` and `InsuranceClaim`: coverage/claim state, relationships and documents.
- `PropertyExpense`: classification and dimensional links to a canonical Finance transaction.

## Source reconciliation metadata

Every migrated record carries `legacySource.system`, `storageKey`, `legacyId`, `sourceIndex`, and `sourceChecksum`. Target IDs are deterministic from type and legacy ID so repeated extract/transform runs reconcile rather than duplicate.

PropertyDocument binaries are stored outside the aggregate workspace in the dedicated Estate Vault blob store. The workspace retains only authenticated retrieval metadata, MIME type, byte size, SHA-256 hash, related Estate entity IDs, and legacy file provenance. Migration file payloads are uploaded in resumable chunks and are finalized only after their legacy checksum and byte count match the pending manifest.

## Persistence contract

The first implementation uses a repository abstraction backed by strong-consistency Netlify Blobs, consistent with Brevity's current server strategy. Each property workspace is a versioned normalized aggregate under a household-scoped key. Each committed version is written to an immutable backup key, the canonical workspace is updated, and an audit record is appended. The canonical workspace also embeds `lastChange`, preserving minimum audit evidence if a later audit write is interrupted.

All API access requires Brevity household authentication. Reads are available to signed-in household members. Legacy import commits require the administrator role. Optimistic `expectedVersion` checks prevent stale-device overwrite. A dry run is the default; committing requires `commit: true`.

This aggregate design gives the current deployment an atomic property-level import and a stable repository boundary. If record volume or querying later requires Postgres, the repository can move without changing Estate UI/domain contracts.

## Deliberate exclusions from the first increment

- No binary document import through JSON.
- No automatic HomeHQ overwrite or project duplication.
- No automatic Finance or Calendar writes.
- No AI write access.
- No Malbec read-only switch or infrastructure change.
