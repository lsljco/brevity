# Daily action and meeting workflow audit

## Observed causes and corrections

| Journey | Finding | Change |
| --- | --- | --- |
| Complete daily work | Today Update launched an assistant conversation and required model interpretation of a known source record. | One-tap completion for saved outcomes and assignments; direct date/status/notes editor. Prepared exact proposals, server permissions, CAS versions, immutable audit and Undo remain. Retry reuses the prepared proposal after an uncertain response. |
| Record a meeting | Recorder already persisted across navigation, but had no shared pause/resume. Guided microphone pause did not explicitly pause the archived recorder. | Shared pause/resume, elapsed active time, paused metadata, stop while paused, and clear local/cloud save state. Guided pause also mutes the input track, cancels speech, clears buffered input and stops accepting turns. |
| Communicate and make a voice change | A 90-second follow-up window could treat ordinary room conversation as addressed to Brevity. Even exact task completion used the general model. | Addressed-only responses by default, optional conversational follow-ups. Exact, unique, owned/shared task completion in Today uses the direct versioned action path. Ambiguous names, pronouns, and other changes use normal review. Shared-room guided speech retains existing actor/approval safeguards. |
| Accept meeting actions | Analysis could return after the plan/transcript changed. Task lists were replaced with index-derived IDs. | Reject stale analysis, preserve existing tasks/owners/status, deduplicate proposed task titles, require review for new work, retain summary and unresolved questions alongside the recording. Accepted draft still uses versioned plan review. |
| Carry work to tomorrow | Existing rescheduling preserves source IDs but Today routed updates through conversation. | Direct editor uses original source date/version for carried work. Preserve notes; do not complete broader outcomes or bypass chore/project sign-off. |

Guided Finish stops recording before preparing its review. The recording remains available if analysis fails. Analysis is still asynchronous AI work; task taps no longer depend on it. Production network latency has not been benchmarked against private household data.

This release addresses workflow mechanics. The previously rendered Today/evening visual redesign is not claimed as implemented by this change. Calendar/provider changes still use their dedicated source workflows. Calendar Details opens the calendar; it does not invent missing event details. Chores and projects retain their source review and sign-off.

## Validation

Unit coverage includes exact source updates, original-date rescheduling, protected source exclusions, uncertain-response retries, strict voice intent matching, preserved completed task IDs, repeat-analysis deduplication, addressed-only replies, and retained paused recording metadata.

Browser coverage uses synthetic household records on desktop, iPhone, iPad portrait and landscape. Checks include retry/Undo without assistant activation, zero general-model calls for an exact completion command, stale-analysis rejection, recording across navigation, pause/resume, stop while paused, and playback after reload. No private family recordings or ledger records were used.
