# Malbec browser export and reconciliation runbook

Use this runbook before importing any Malbec record. Malbec remains writable and available until the separate read-only acceptance gate is approved.

## Collection scope

Inventory every device, browser, and browser profile that has been used with Malbec Estate. Private/incognito profiles normally do not persist, but confirm with the household. Record the device name, browser, profile, operator, export time, and local time zone for each collection.

Malbec exports can contain household, medical, ministry, and financial information. Store raw exports in an access-controlled migration location. Do not commit them to either Git repository or attach them to a public issue.

## Export procedure

1. Open the current Malbec application on the original device and browser profile.
2. Confirm the expected records are visible. Do not edit, restore, clear storage, or run a migration.
3. In Malbec Settings, use the backup/download action to export every `malbecHOS_*` key.
4. Name the untouched file with a stable device/profile label and UTC date, for example `malbec-ipad-safari-primary-2026-08-23.json`.
5. Calculate and record a SHA-256 checksum outside the file.
6. Verify that the JSON opens and contains the expected `malbecHOS_*` keys. Do not normalize or re-save the source file.
7. Repeat for every device/browser/profile, even when records appear identical.

If the Settings exporter is unavailable, stop and repair/export from a copy of that browser profile. Do not use Restore as an extraction method because it overwrites the current browser state.

## Read-only dry run

From a Brevity checkout, keep all raw inputs and the report outside the repository, then run:

```bash
npm run estate:migration:dry-run -- \
  --output /secure/migration/malbec-reconciliation.json \
  /secure/migration/malbec-ipad-safari-primary-2026-08-23.json \
  /secure/migration/malbec-mac-safari-primary-2026-08-23.json
```

The command refuses to overwrite an existing report or a source export. It performs no network requests and writes nothing to Brevity or Malbec.

## Reconciliation acceptance

- Confirm the source-device inventory is complete.
- Compare per-device source keys and counts.
- Resolve every same-ID/different-content conflict manually; the tool does not select a winner.
- Treat a record missing from one device as unresolved, not deleted, because Malbec has no deletion tombstones.
- Separate repository seed/default rows from verified household history.
- Confirm deferred non-Estate keys are assigned to their owning Brevity workstream.
- Sign off on accepted counts and source hashes before enabling any import endpoint.

Raw source exports remain immutable throughout Extract → Transform → Import → Validate → Reconcile.
