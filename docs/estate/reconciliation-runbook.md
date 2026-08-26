# Malbec export and reconciliation runbook

This procedure is non-destructive. It does not change Malbec browser storage, files, calendar data or production infrastructure.

## Collect source exports

1. On every browser/device that has been used to edit Malbec, open Malbec Settings and download its JSON data backup.
2. Do not restore, rename keys inside, or edit the JSON.
3. Name the downloaded copy with the device and date, for example `malbec-larry-iphone-2026-08-26.json`.
4. Retain the original file in protected storage. The Brevity inspection never replaces it.
5. Repeat on every device because Malbec localStorage can contain different records on different browsers.

## Inspect in Brevity

1. Sign into Brevity as the household administrator.
2. Open **Household Management → Malbec Estate**.
3. In **Administrator migration console**, choose all available original JSON backups together, or add them one at a time.
4. Review each source export and the cross-device comparison. Brevity blocks import when a maintenance/project ID is missing from one source or has divergent content.
5. Review storage-key count, source-record count, duplicate IDs, deferred keys and embedded-file totals for the selected candidate.
6. Review every exact match to Malbec's built-in maintenance/project examples. Mark each one **Exclude sample** or **Keep as real**; Brevity never guesses.
7. Run the safe migration preview. This sends only the selected structured copy after embedded file bytes have been removed locally, plus the sanitized comparison and seed-review manifests.
8. Confirm that both **Payload integrity** and **Record counts reconcile** pass and that no seed decision remains unresolved.
9. Download the reconciliation report and retain it beside the untouched source exports. The report contains manifests, seed decisions and checksums, not embedded file bytes.

## Compare multiple devices

Do not commit the first backup until all known device exports are inspected. Compare:

- source checksum and export size;
- maintenance and project counts;
- legacy IDs and update timestamps;
- embedded-file count and byte estimate;
- keys present on only one device;
- duplicate IDs;
- records with the same ID but different source checksums.

When property records agree, Brevity recommends the newest export as the candidate while retaining every compared source checksum. When they do not agree, import remains blocked until the source records are reconciled. Never assume the largest or newest file is complete.

## Initial structured import

The console permits one initial import only. It requires:

- administrator authentication;
- a successful server dry run;
- server verification that the inspected structured payload was not changed before transformation;
- exact agreement between inspected importable records and transformed work orders/projects;
- an explicit import-or-exclude decision for every record that exactly matches a source-code default;
- no duplicate-ID blocking issues;
- an explicit confirmation;
- no existing durable Malbec Estate workspace.

The import creates version 1, an immutable backup and an audit record. Malbec remains operational. Embedded files remain listed as `pending-document-import`; supplies and calendar keys remain deferred.

## Stop conditions

Do not commit when any of the following is true:

- not every known source device has been exported;
- duplicate IDs remain unresolved;
- the structured payload exceeds the safe limit;
- expected maintenance/project counts are missing;
- source files were manually edited without a reconciliation record;
- payload-integrity or record-count validation fails;
- any exact code-default match remains unresolved;
- the Estate workspace already exists;
- the preview contains unexplained warnings.

After the initial import, all further changes must use a reconciliation/merge workflow. They must never replace the canonical workspace wholesale.
