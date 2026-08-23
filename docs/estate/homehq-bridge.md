# HomeHQ → Estate compatibility bridge

This increment audits and transforms the existing `homehq_items_v1` record without changing HomeHQ writes, deleting browser data, or enabling Estate imports.

## Mapping

| HomeHQ input | Estate target | Rule |
|---|---|---|
| Renovation item | `PropertyProject` | Preserves dates, priority, RACI, costs, room/location, notes, contractor reference, and calendar source ID |
| Maintenance item | `WorkOrder` | `workType=maintenance`; preserves the same operational fields |
| Repair item | `WorkOrder` | `workType=repair`; preserves the same operational fields |
| Contractor fields | `Vendor` | Exact normalized company identity only; conflicting contact/compliance copies are quarantined |
| Photo or file | `PropertyDocument` metadata | Embedded bytes are inventoried and fingerprinted but remain in the untouched source until object-storage extraction |
| Room/custom room | Physical location | Rooms are not converted into property systems |
| Family Calendar flag | Existing calendar source metadata | No second calendar event is created by the bridge |

HomeHQ IDs become stable Estate IDs. Mutable field changes alter the legacy content hash without changing the target ID, allowing stale or conflicting copies to be detected.

## Safety controls

- Dry run only: `importAllowed=false` is present in every bridge manifest.
- The API requires a signed household administrator session.
- The audit response contains counts, hashes, warnings, and contractor conflicts—not embedded attachment bytes.
- Existing `homehq_items_v1`, its backup keys, and Family Calendar records are never written.
- Attachment metadata records require SHA-256 and object-storage completion before import.
- Declared attachment sizes are compared with decoded byte counts.
- Exact duplicate rows are collapsed; duplicate IDs with different content are quarantined without choosing a winner.
- Invalid dates are quarantined while original values remain in legacy metadata.
- Storage-service errors propagate instead of returning a misleading partial audit.

## Running the audit

In Brevity, open Household Management → Malbec Estate → Command Center. A household administrator can select **Run compatibility audit**. The audit reads the latest synchronized HomeHQ snapshot and performs no writes.

The synchronized snapshot is not sufficient for final acceptance when a browser contains unsynchronized changes or exceeds the shared-state size limit. A current browser backup must also be collected and compared before import.

To audit a complete Brevity browser backup outside the repository:

```bash
npm run estate:homehq:dry-run -- \
  --output /secure/migration/homehq-audit.json \
  /secure/migration/brevity-browser-backup.json
```

The command refuses to overwrite the source or an existing report and performs no network or database writes.

## Import gates still blocked

1. Compare the synchronized snapshot against browser exports.
2. Resolve contractor identity conflicts.
3. Extract attachments to durable object storage and calculate SHA-256 checksums.
4. Validate project/work-order counts, fields, RACI, dates, costs, and calendar source IDs.
5. Create a rollback export and receive explicit migration acceptance.

Until these gates pass, HomeHQ remains the active write path and Estate exposes only verified imported records.
