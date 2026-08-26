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
3. In **Administrator migration console**, choose one original JSON backup.
4. Review storage-key count, source-record count, duplicate IDs, deferred keys and embedded-file totals.
5. Run the safe migration preview. This sends only the structured copy after embedded file bytes have been removed locally.
6. Save the displayed source checksum and counts in the reconciliation log.

## Compare multiple devices

Do not commit the first backup until all known device exports are inspected. Compare:

- source checksum and export size;
- maintenance and project counts;
- legacy IDs and update timestamps;
- embedded-file count and byte estimate;
- keys present on only one device;
- duplicate IDs;
- records with the same ID but different source checksums.

Choose or create one reconciled source export. Never assume the largest or newest file is complete.

## Initial structured import

The console permits one initial import only. It requires:

- administrator authentication;
- a successful server dry run;
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
- the Estate workspace already exists;
- the preview contains unexplained warnings.

After the initial import, all further changes must use a reconciliation/merge workflow. They must never replace the canonical workspace wholesale.
