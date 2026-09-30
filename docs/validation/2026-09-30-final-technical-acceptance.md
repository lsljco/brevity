# September 30 technical acceptance

This report separates production implementation, technical verification and real household acceptance. It does not certify unobserved physical-device or adoption results.

## Verified baseline

- Production main `6ca05ca7cfd72b8e894d08da360d96d8555d51f4` includes native Netlify runtime/storage repairs (PR #242), the Plaid package correction (PR #243), and tablet meal-card layout (PR #244).
- Earlier PR #242 acceptance exercised separate staging authentication, household storage, reviewed task and workout save/reload/readback/Undo. Both synthetic records were undone. The full model evaluation passed 47/48, with the corrected cross-pillar case passing a focused follow-up; all 20 isolated persistence/recovery checks passed. This is not a claim that the whole suite was rerun on the focused candidate.
- PR #243 passed 1,214 tests and 238 browser checks (22 skipped). Its production balance refresh succeeded. The subsequent transaction-refresh completion was not certified by that observation.
- September 30 scheduled backup: dispatch at 08:10:13 UTC, complete at 08:11:43 UTC; matching job `2546f15d-6448-4292-af74-cc55a4e1e96c` on main `6ca05ca`. Netlify schedule `10 8 * * *` matches this run. No manual invocation was used. This closes scheduled backup execution/completion, not a new restore rehearsal.

## Architect controls and synthetic pipeline

Larry authorized the scoped dispatcher and provider setup, then explicitly approved the two activation settings. GitHub default token permissions remain read-only. The protected proposal job requests its own Contents/PR write permission. Required reviewer is `lsljco`; administrator bypass is off; the environment admits main only. Production Netlify previews are disabled; draft previews go to separately credentialed `brevity-architect-staging`.

Synthetic run `36649137103` generated a pure helper and six tests. Artifact `11069956815` was inspected. All 1,220 tests and build passed inside the network-disabled verification container. The proposal job waited for review, then created draft PR #245 at `352bb2582d926aaa30934bab8137d848c3767bea`. Staging deploy `6abcc9658661ea0008bc7311` succeeded with 78 functions; browser smoke reached the normal sign-in screen. This disposable draft is not a production enhancement and remains unmerged.

## Real application-dispatch acceptance

Larry approved "Clear progress while Brevity responds" and authorized its implementation plan and staging prototype. Production Action Mode saved proposal `b597edef-4c1e-4750-962e-a0ed900dca28`, recorded concept approval, and saved the complete implementation packet. All writes used normal review, version and audit controls.

Requirements: honest pending-response status, elapsed waiting time, delayed message at 15 seconds, no fabricated stage or completion estimate, no per-second assistive announcements, cleanup on lifecycle changes, and unchanged voice/request/action behavior. Data and permissions are unchanged; rollback is a code revert.

Application dispatch returned receipt `efedc4d69a987c76b94d3c530dcc44fd28fa4e9a`, state `dispatched`, requested at 08:49:57 UTC. GitHub workflow `36692176446` has that exact receipt in its run name. This proves the real production application initiated the workflow with its scoped credential. The generated artifact was inspected. Its timing test wrongly expected whole-second ticks within 120 milliseconds and left its interval running after failure. Verification was canceled; the proposal/publish job did not run. The generated change was corrected through separately reviewed PR #246, preserving its receipt/proposal provenance. This is a successful dispatch and a rejected first candidate, not a successful autonomous feature release.

## Acceptance still requiring direct evidence

- Physical iPhone/iPad voice remains OPEN/FAILED: Larry’s September 30 screenshots show a schedule response and conflict follow-up, but audio was blocked and Markdown markers were displayed literally. The screenshots establish retrieval/continuity, not successful playback or proven speech recognition. The follow-up release adds same-element audio priming, direct-tap playback recovery (also inside action reviews), safe formatted text, and honest elapsed progress. Retest the actual device after publication.
- Real household pilot usefulness, correction burden, member feedback and measured adoption over time.
- Broader exact-product nutrition sampling, without claiming universal nutritional accuracy from synthetic calculator fixtures.
- Additional households remain conditional on pilot results, explicit consent and tenant/auth/storage isolation review. Current deployment is one named household.
- Applied human learning and comparative workflow testing require participation and observations. Official-source competitive desk research is completed in ../competitive-learning-and-pilot.md; it is not a completed comparative user study.

## Retention observation

September 30 background retention job `deff2577-455d-4f33-80d0-66096d735f49` ran at 08:35:10 UTC and completed at 08:35:18 UTC, matching the configured daily retention time. No manual trigger or record deletion was initiated by this review.

## Published response usability — PR #246

Exact verified head `dc1a220f017bf2f165dcd2a2c3b7e4e2843ff506`, merged as `a86124216706bf2747d898833d20e48682f4fa49`, production deploy `6abcd2b2ffa197000858ffe3`. Local 1,215 tests and build passed; CI verification `36693622447` and browser regression `36693622394` passed (250 passed, 22 skipped). The same audio element is primed by the user gesture and reused for TTS, blocked audio retains a direct Play response recovery path, reviews retain their own playback/approval sequencing, response formatting is rendered safely, and pending requests show honest elapsed progress.

Authenticated production smoke observed working status, a correctly formatted answer and Read aloud starting then returning idle without a displayed error. This is desktop evidence, not physical iOS acceptance. The real Architect proposal now records prototype-ready and release-approved evidence; post-release measured usefulness has not been invented.

## Provider refresh correction — PR #247

A production transaction refresh remained partial. Inspection found a concrete response-schema error: `/item/get` returns `data.status.transactions.last_successful_update`, but Brevity read `data.item.status`. Both the installed Plaid SDK ItemGetResponse type and https://plaid.com/docs/api/items/ confirm the root status field. The prior test repeated the wrong shape.

Candidate `4cf57f105fb60da567a8271e590f3f6bd83e6f13` corrects the reader and schema fixture, rejects absent/invalid/unrelated timestamps, and passes 1,216 tests plus the production build locally. Receipt persistence and source verification are unchanged. Both CI jobs passed: verification 36702512352 and browser regression 36702512263 (250 passed, 22 skipped). Merged as `5358271732230cd3a985b3ccd48209f9711c54f1`. The publication and post-release live bank-refresh record is maintained in [PR #247](https://github.com/lsljco/brevity/pull/247), avoiding a claim before observation.

## Calendar ownership correction — PR #248

An authenticated production seven-pillar briefing returned schedule, chores, meals, fitness, spiritual, learning, finance and ministry context. It correctly distinguished planned activity from completion and projected bills from payment. It nevertheless called overlaps with unassigned shared events personal conflicts and recommended travel logistics without confirmed attendance.

Schedule, daily-briefing and agent guidance now consistently require named attendance on both records before calling an overlap a confirmed personal conflict. Shared overlaps require attendance confirmation; all-day and multi-day records may be informational windows. This changes response guidance, not source records or permissions. The 1,216 tests and build pass locally. Exact final candidate CI, preview, publication and live wording evidence are tracked in [PR #248](https://github.com/lsljco/brevity/pull/248). No new household records were changed during the read-only briefing test.
