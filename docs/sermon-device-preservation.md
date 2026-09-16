# Apostolic Sermon Builder device preservation

## Purpose

The legacy Apostolic Sermon Builder stores important records in browser `localStorage`. Those records do not automatically follow Lorenzo to another browser or device. Brevity therefore treats every browser as an independent legacy source and preserves it before any consolidation or retirement work.

## Never do this before validation

- Do not clear Safari history or website data.
- Do not uninstall a saved web app or reset its browser.
- Do not overwrite the legacy application's storage with another device's export.
- Do not assume the legacy **Export JSON** action is complete. It omits several record types.

## Records covered by the full-device rescue

- Sermon library records, including generated sermon content, notes, quotes, Facebook drafts, and infographics
- Library folder metadata
- Revelation threads
- Captured mic-drop groups
- Generated quote groups
- Counseling profiles contained in the same legacy application storage

Counseling data is sensitive. It remains inside the authenticated, immutable device backup and must not be exposed in ordinary sermon search or UI.

## Per-device procedure

1. Sign in to Brevity and open **Settings → Apostolic Sermon Builder → Device Rescue & Durable Preservation**.
2. Copy the rescue bookmark code.
3. On the source device, create a browser bookmark and replace its address with the copied code.
4. Open the full legacy Apostolic Sermon Builder at `https://apostolicsermonbuilderlseay.netlify.app/` in the browser that contains the records.
5. Run the rescue bookmark, give the device a unique label, and retain the downloaded JSON file.
6. Return to Brevity Settings and upload that file.
7. Verify the displayed sermon, thread, and counseling-profile counts against the rescue alert on the source device.
8. Download Brevity's immutable backup and retain a second offline copy.
9. Repeat from step 2 on every phone, tablet, computer, browser, and browser profile that may contain legacy work.

Re-uploading the exact same package is safe and idempotent. Divergent versions that share a legacy sermon ID are retained separately and flagged for review.

## Acceptance gate

The legacy application remains writable and untouched until all of the following are true:

- Every known device/browser has a labeled Brevity import or a documented zero-record result.
- Counts are reconciled for sermons, folders, threads, quote groups, and counseling profiles.
- Each imported device has a downloadable immutable backup.
- Recovered sermon records can be downloaded individually from the Teaching Repository.
- Conflicting versions have been reviewed without deleting either source version.
- Newly created Brevity teaching documents appear on a second authenticated device.

Only after this gate may the legacy builder be made read-only. A separate acceptance decision is required before any site-data cleanup or infrastructure retirement.

## Durable target

New Brevity sermon documents are stored through authenticated server functions in the shared sermon repository; browser storage is not their system of record. The rescue endpoint retains legacy source checksums, device labels, import actor and time, exact exports, exact recovered records, and a non-destructive union index for reconciliation.
