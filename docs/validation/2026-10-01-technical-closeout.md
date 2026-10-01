# Technical closeout — October 1, 2026

Scope: continue the existing repository and production application. The owner deferred Health Connection and Household pilot work. No new parallel implementation, health consent, pilot observations or historical vendor assignments were created.

## Delivered fixes

- Plaid's explicit pending transaction ID survives server mapping and the existing full/incremental transaction merge. A posted expense resolves its original reviewed vendor assignment only through that provider ID. A direct posted assignment wins. Because no derived assignment is persisted, Undo of the original assignment remains effective. Name, amount and date similarity never establish a link.
- Scheduled backup coverage now includes vendor directory/assignment metadata. The isolated recovery harness restores every covered store, checks stable IDs/versions, refuses unreviewed or stale overwrites, retains before-images, rolls back conditionally and rejects corrupt backup contents.
- The project ledger and acceptance documents distinguish deferred observations from delivered technical work.

## Verification

Runtime candidate `11d15559e7f40c96aa094b56c335ce54194e25c5`, PR #257: 1,277 unit/server tests passed; production build and source/bundle budgets passed. GitHub verification run `36800455050` succeeded. Browser run `36800455090` passed 290 checks with 22 intentionally skipped. Later documentation-only changes are tracked by the PR's exact-head checks.

The production dependency gate passed under its existing time-limited image-size/pptxgenjs exception through October 1; this is not a zero-vulnerability claim. No exception was broadened or extended.

The 21-check recovery harness passed against conditional-storage fixtures. The preview deployment succeeded, but this session has no authenticated staging cookie, so the expanded deployed Blob rehearsal is **not claimed**. Earlier deployed recovery and production scheduled-job observations apply to their documented earlier coverage. Neither result certifies full account-level disaster recovery. Credentials, protected vendor ciphertext/keyring, conversations, generated media and external providers remain outside this backup's scope.

## Production Apple project acceptance

Using the existing administrator session and normal Action Mode review:

1. Created one clearly labeled temporary, nonfinancial project with a canonical UUID and a one-day October 1 calendar window.
2. Published its saved snapshot to Apple Calendar. The app returned a completed audit receipt.
3. Prepared another publication. Provider readback resolved the same saved Apple UID and produced **Record update**, rather than another create; applied successfully.
4. Removed the publication with the required confirmation; the completed audit receipt retained the provider UID.
5. Undid that removal through the audit control; the app reported successful Undo.
6. Removed the restored Apple publication, then undid temporary project creation. Production returned to its original two projects, with no temporary QA project remaining. Audit history was preserved.

This verifies the provider-backed action lifecycle through Brevity. It is not a recording of a physical Apple device's calendar display. Existing projects and unrelated events were not edited.

## Implementation-owner learning trace

A conversation can retrieve authorized records or prepare a proposal; chat text is not an authoritative database write. `assistant-action-contract.mjs` defines permitted operations. `prepareRecordOperations` in `assistant-action-executor.mjs` checks current-record permissions and reviewed versions before preparing a write; resource writers enforce version/conditional-storage checks. The action repository retains the reviewed change and Undo evidence. The same guard applies even if a model produces a plausible request.

The maintained permission, voice-review, nutrition and action tests reproduce cross-member, stale-review and stale-version rejection. The production temporary-project sequence above demonstrates review, persistence, provider readback, audit and Undo. This completes the implementation-owner technical trace; it does not certify Larry's, Lorenzo's or another participant's understanding.

## Explicit limits and ongoing work

- Health Connection and Household pilot: deferred by the owner.
- Historical vendor assignments: require reviewed canonical relationships. An empty directory cannot be safely populated by guessing transaction labels.
- Nutrition: representative manufacturer/portion evidence is in the September 30 label report; future package variants and physical photos remain ongoing QA, not a finite universal-accuracy gate.
- Participant learning and comparative task outcomes: exercises are prepared; no participation or feedback is invented.
- Additional households and specialist agents: conditional future phases, requiring demonstrated need and the existing isolation/consent review.

Merge and deployment identifiers are recorded on PR #257 after release verification.
