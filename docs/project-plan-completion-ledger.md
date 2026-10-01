# Project plan delivery ledger — updated 1 October 2026

Source: Brevity_Project_Plan.pdf (nine pages, reviewed in full). This ledger distinguishes implementation, verification and real-world adoption. It does not certify the entire plan complete.

## Current scope — October 1 closeout (PR #257)

The owner explicitly deferred **Health Connection** and **Household pilot** work. Their signing/device/consent and observation requirements are not completed and are not gates for this requested technical closeout. The earlier dated sections below remain historical evidence.

Completed implementation: exact-provider pending-to-posted vendor lineage; vendor metadata included in scheduled backup coverage; synthetic recovery checks expanded to every covered store with integrity, stale-write and rollback checks. Production Apple project publication, repeat publication of the same provider record, removal and Undo were exercised through reviewed Action Mode using a temporary project, then the publication was removed and project creation undone. Existing projects were preserved.

The technical package passes 1,277 unit/server tests, build and size budgets. Final CI/deployment evidence is tracked in [PR #257](https://github.com/lsljco/brevity/pull/257) and [the closeout report](validation/2026-10-01-technical-closeout.md). The expanded recovery harness passed all 21 checks against deployed Blob storage on PR #258 at runtime `41528d1`, run `6cfebadb-2976-45d7-b6b8-b429eb74c166`, completed October 1 at 01:58:39 UTC. Sign-in survived reload before the authenticated run; synthetic fixtures only, no production writes. PR #258 also requires a separate uncached same-member session read before the client reports successful sign-in. Its release record tracks final publication.

Historical expense assignment requires explicit canonical vendor relationships supplied or reviewed by the household. The live vendor directory is empty; no relationships were fabricated from merchant labels. Participant learning certification, repeated physical-package nutrition sampling, a full account-level disaster exercise, and conditional expansion are not code-delivery claims. Prepared exercises and representative technical evidence are complete; no user study or participant understanding is invented.

## Current checkpoint — September 30

Earlier sections below are historical release evidence. The current production baseline includes PRs #233–#246, including cross-pillar daily briefing and schedule retrieval, lower-overhead conversation turns, spoken confirmation for routine task/work-block and own-member activity changes, native staging storage/authentication repair, finance packaging correction, tablet layout correction, same-element voice playback/recovery, formatted responses and elapsed progress. PR #247 corrects provider transaction-refresh status and has passed CI and merged; its [release record](https://github.com/lsljco/brevity/pull/247) tracks publication and live acceptance. PR #248 tightens calendar ownership guidance after a real briefing exposed overconfident conflict wording; its [release record](https://github.com/lsljco/brevity/pull/248) tracks final acceptance.

| Acceptance item | Current evidence |
| --- | --- |
| Household conversation and reviewed actions | Deployed evaluations and representative persistence/readback/Undo flows passed; physical-device voice remains a separate gate. |
| Separate staging | Authenticated task/workout acceptance passed; test records undone. No production bank/calendar/OneDrive credentials copied. |
| Automatic recovery jobs | September 30 scheduled backup dispatched 08:10 UTC and completed 08:11:43 UTC; retention completed 08:35:18 UTC. |
| Architect generation, review and draft preview | Synthetic workflow 36649137103 passed 1,220 tests/build, held at its reviewer gate, then created draft PR #245 and deployed isolated staging. |
| Application-initiated Architect dispatch | Real approved proposal b597edef-4c1e-4750-962e-a0ed900dca28 returned dispatched receipt efedc4d69a987c76b94d3c530dcc44fd28fa4e9a, matched to GitHub workflow 36692176446. The first generated candidate failed verification and was stopped. Corrected PR #246 passed normal CI and was published as a861242; the proposal records release approval. Post-release household measurement remains open. |
| Response usability | PR #246 published in deployment 6abcd2b2ffa197000858ffe3; authenticated desktop response, formatting and playback exercised. Physical iPhone retest still required. |
| Competitive learning | Official-source desk research completed and applied learning/pilot exercises prepared in [competitive-learning-and-pilot.md](competitive-learning-and-pilot.md); participant exercises and comparative outcomes are not yet observed. |
| Household pilot / device acceptance | Open until actual device and family observations exist. |
| Future households and specialists | Conditional later phases; require pilot evidence and, for other households, separate tenant review and consent. |

See [current technical acceptance](validation/2026-09-30-final-technical-acceptance.md) for exact identifiers and limits. Automated test counts do not establish family adoption or complete the human learning workstream.

## Production baseline

PR #230 was merged as `1bd733e6ba9f01bb5644e2f5d2f088409bf09775` and published in Netlify deployment `6abb22ca09bba50008c41062`. Its 40 live structural evaluations and 14 isolated persistence checks passed. The earlier “PR draft / production unchanged” entries in implementation-plan-progress.md are historical.

## Verified release candidate — PR #233

Runtime candidate `5b0dbcdefee4281be2ab002e91f05d2a2fe16a95`: 1,176 local tests, build, GitHub verification and browser regression passed. The full maintained live suite passed 48/48 on preceding runtime `7291f82`, with 20/20 actual persistence checks; the only subsequent runtime change explicitly distinguishes absent usage measurements and passed a focused deployed retest. See [the complete evidence](validation/2026-09-29-project-plan-package.md). Publication and production backup observations are tracked in [PR #233](https://github.com/lsljco/brevity/pull/233).

## Implementation package and evidence

| Plan requirement | Implementation | Evidence and remaining acceptance |
| --- | --- | --- |
| Household agent and open-ended questions | Existing Agents SDK reasoning, research and reviewed actions, plus explicit capability limits | 48/48 deployed cases passed; response contents inspected |
| Conversation continuity | Member-bound server history, version conflicts, 60-message/30-day retention, seven-day clear recovery, legacy-cache migration | Verified authenticated preview reload, clear/restore, version conflicts and member isolation |
| Voice-first meals and corrections | Existing conversational identity/quantity clarification, retrieved product evidence and server arithmetic; optional photo extraction feeds the same conversation | Meal review/save/correction/readback/Undo and photo handoff passed; additional manufacturer variant/portion samples passed September 30; physical iPhone microphone acceptance remains |
| Nutrition beyond macros | Unknown-preserving fiber, sugar, sodium, potassium, calcium and iron; packaged nutrients scale from label servings; hydration is reported activity | Label/portion and seven-value photo sample passed; no universal nutrition-accuracy claim |
| Seven-pillar actual activity | Reviewed own-member workout/progress/maintenance/study/ministry/expense/sleep/hydration records; correction, audit and Undo | Deployed persistence passed; completed walk reviewed, saved and undone through the UI |
| Education evidence | Adult-reviewed observations feed existing learning record and derived mastery | Deployed save/Undo passed; prompted evidence remains distinct from independent evidence |
| Weekly guidance | Shared plans plus own private nutrition/activity and authorized learning; explicit source gaps | Live briefing distinguished plans, reports and missing sources; actual household usefulness remains a pilot measure |
| Module configuration | Reviewed enable/disable/rename/reorder; custom modules provide member-note workspaces | Custom module reviewed/saved, present after reload and undone in live UI; specialized new apps still need implementation |
| Usage-driven improvements | Content-free counts/latency/ratings, measured-evidence tool, concept approval, implementation packet, prototype/release evidence and measurement stages | Preview metrics retrieval passed with recorded/missing/failed date coverage; establish real baseline after deployment |
| Staging | Build-bound per-preview stores, no production data fallback; Apple Calendar disconnected, bank linking and OneDrive publishing blocked | Deployed preview isolation and external-write guards verified by runtime/UI/persistence checks |
| Recovery | Scheduled immutable per-record snapshots of shared state, plans, meals and action history; hash validation and conditional restore primitive | Real isolated Blob restore passed; manual preview scheduled dispatch completed in Netlify logs; production automatic backup completed September 30 at 08:11:43 UTC and retention at 08:35:18 UTC |

## Operational boundaries

Preview authentication intentionally uses the existing household identity service. Household application data and Action Mode journals use separate stores. Preview sessions do not confer a second household or tenant boundary. No production data is copied into staging automatically. Calendar availability in preview is therefore intentionally different from production.

Usage measurements exclude message text, photo content, food values, bank values and student evidence. Member metrics are private; Larry/Lorenzo administrators can inspect household totals. Counts begin with deployment and are not historical adoption measurements or causal conversion rates. Metrics expire after 90 days. Assistant job payloads, including optional images, are pruned after one day. Scheduled cleanup runs in production; preview stores require explicit environment retirement because Netlify does not run preview schedules.

Recovery snapshots contain sensitive household records and stay in the same protected Netlify project. They exclude authentication credentials, bank/OneDrive tokens, conversations and generated media. They are per-record captures, not an atomic cross-store snapshot. The restore primitive is operator-only and requires an exact content hash plus current destination version; it is not a public restore endpoint. Complete backup runs retire snapshots older than 30 days. A reviewed operator restore command records the before-image and rejects stale versions; the isolated deployed restore rehearsal and September 30 automatic production schedule observations have passed. A full production disaster recovery exercise remains an operator exercise, not something to simulate by overwriting live records.

## Remaining gates — not completed by a build

1. **Physical-device acceptance:** run the exact iPhone sequence in [competitive-learning-and-pilot.md](competitive-learning-and-pilot.md). Earlier screenshots demonstrated retrieval and continuity but blocked playback. PR #246 fixes the observed paths; actual-device success is not yet observed.
2. **Household pilot:** measure usefulness, manual effort, abandonment, corrections and member feedback over actual use. Existing content-free metrics support the review but cannot establish a week of adoption on release day.
3. **Nutrition quality monitoring:** the initial representative label/portion sample is verified, including three additional manufacturer variants/portions and ambiguous-input clarification on September 30; see [the sample evidence](validation/2026-09-30-label-and-response-acceptance.md). Wider physical-package and photo sampling continues as product QA; universal nutrition accuracy is not claimed.
4. **Applied learning:** the curriculum and exercises are prepared; Larry/Lorenzo and household participants must perform their exercises before their understanding is certified. Desk research is complete; comparative workflow testing remains observational work.
5. **Conditional expansion:** additional households require successful pilot evidence, tenant/auth/storage isolation review and explicit onboarding consent. Further specialist agents require demonstrated need. These are later conditional phases, not enabled automatically to meet tonight's deadline.

Closed technical gates include publication of PR #233, isolated recovery rehearsal, automatic production backup/retention, scoped Architect activation, protected synthetic pipeline and real application dispatch. See the dated technical report for exact evidence and the rejected first generated candidate. No synthetic draft is silently promoted to production.

## Learning sequence tied to this implementation

- Trace a spoken meal from transcription through clarification, research, calculation, reviewed action, persistence and Undo. Reproduce an ambiguous portion and a failed source without changing household data.
- Inspect an SDK tool and a server authorization check. Explain why a capable general conversation does not imply unrestricted database or deployment permissions.
- Review a failed evaluation response and write an acceptance criterion based on behavior, not tool count alone.
- Use real pilot metrics to prepare one improvement problem statement. Review requirements, data access, tests, staged rollout and rollback before implementing it.
- Compare alternative household workflows using the same real tasks and consented observations: time, correction rate, burden, usefulness and data controls. Do not infer product superiority from a feature checklist.

## Conversational feedback completion — September 30

The plan audit found that ratings required interface buttons. The Household Agent now has a server-bound conversational feedback tool for an explicit request to save feedback. It stores only helpful/friction plus a fixed category (voice, latency, accuracy, missing context, too many steps, missing capability, reliability, other). No feedback transcript enters usage metrics. Member identity and event ID come from the server; retries cannot double-count or replace a different rating. Category summaries are available to the existing Architect usage reader. Historical button ratings remain uncategorized; no old content is mined. Ratings do not create or approve improvement proposals.

Automated repository and SDK checks cover persistence, identity isolation, content scrubbing, duplicate/replayed turns, storage failures and absent recorder capability. The maintained model suite includes explicit feedback and hypothetical/no-write cases; listing these cases is not a claim of a live model pass. Release and production acceptance evidence are recorded in the associated pull request. Physical-device voice, longitudinal adoption and participant learning remain observational gates.

## September 30 user device acceptance and task-discovery follow-up

Larry reported “Everything worked” after the five-step physical-device sequence, including task creation and Undo. This is user-reported acceptance, not an agent-observed device recording. He then reported that the created task did not appear on his calendar and its location was unclear. Assignment creation deliberately saves a dated daily-plan task with calendarSync false; it does not create an event. The approved follow-up adds an explicit saved location/calendar distinction and a durable Open task link to the exact saved record. Household pilot and applied learning outcomes remain unobserved.

The latest completed full live suite on PR #250 passed 50/50 cases and 20/20 isolated persistence checks, job ed2da0f5-14bb-480a-a07d-aa4ecc1e8641 at 13:18:18 UTC. Source 8698f33d986e8f335cdb45296442794625474313 matched published merge 05fc8dbbda9156eeff7864a0d64ad981a38e471d by identical tree. Every response was assistant-reviewed; this does not certify human learning or universal nutrition accuracy.

## 2026-09-30 — Pillar evidence and status correction

The household screenshot exposed a real contradiction: 0% actual attainment could be labeled Complete because the status used projected attainment. This correction binds the status to actual attainment and labels the potential score as conditional on completing remaining planned work. Calendar time passing is no longer accepted as completion evidence.

Household Intelligence now reads saved shared daily assignments/decisions and the signed-in member's activity reports through an authenticated read-only endpoint. It does not read other members' private activity stores, including for administrators. Reported activity can contribute to configured targets but cannot silently complete a planned task. Missing durations stay zero rather than receiving a fabricated hour. Missing targets/plans are explained; unavailable source reads withhold scores with a retry option. The configured pillar list is preserved.

Validation: 1,234 logic tests pass; production build passes. Browser coverage checks pending-task actual 0% / potential 100%, saved-task drilldown, and source-failure/retry on desktop, phone-sized Chromium, and both tablet orientations. These are automated fixtures, not physical-device or real household health-data tests.

### Additional request: per-member health sources and daily steps

This is a new integration requirement, not an already completed capability. No member health account has been connected by this change. ChatGPT identity/plan authorization does not expose a user's conversations (https://developers.openai.com/siwc/quickstart). Each member should authorize a direct data-source connection to their own Brevity account. For iPhones, HealthKit requires a compatible native app and per-type consent (https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data). The current Netlify web app has no native HealthKit bridge.

Proposed first delivery: per-member daily steps, configurable goals, source and last-sync indicators, missing-data handling, revocation, and duplicate-safe reconciliation of phone/watch data. Nutrition, sleep, workouts, and clinical records require separate explicit scope decisions; private records must not become household-admin-visible by default. Brevity should present recorded trends and user-approved summaries, not promise comprehensive medical monitoring. This integration needs its own implementation and device verification before it can be called complete.

### 2026-09-30 — iPhone activity connection (PR 253)

Requested extension: every member uses an iPhone; connect personal steps and workouts to Brevity with optional assistant use and household sharing. Implemented member-bound, conditional-write health storage; explicit privacy review; a Health Connections page; read-only authorized assistant context; and a native HealthKit companion with device Keychain sign-in, cumulative step statistics, 30-day replacement snapshots and background observers. Unknown data stays unknown. Workout summaries use merged elapsed windows and can include pauses. Existing household tasks, Action Mode and Undo are unchanged.

Local verification: 1,244 unit/server tests pass; production web build passes. Initial Mac CI passed date/overlap tests, simulator compilation and unsigned iPhone archive creation. Final branch CI and browser checks are release gates. Source and signing instructions: `ios/BrevityHealth/README.md`; member privacy notice: `/health-privacy.html`.

**Not yet complete:** Apple Developer team/signing and distribution, installation on household iPhones, each member’s own consent, and real-device foreground/background sync acceptance. An unsigned archive cannot be installed. No health connection or consent has been created on any member’s behalf. This feature does not import personal ChatGPT history and does not implement clinical monitoring or additional nutrition-data synchronization.

### 2026-09-30 — connected vendor workspace (PR 254)

The Apple Health release (PR 253) is merged and its Health Connections page was verified in the signed-in production app. Final health CI passed 1,244 unit/server tests, 266 browser checks (22 skipped), Swift tests, simulator compilation and an unsigned iPhone archive. Signing, distribution and physical-device acceptance remain outstanding as described above.

PR 254 adds canonical vendor IDs across posted expenses, recurring expenses, debts and projects; a Finance → Vendors workspace; vendor list/report sorting; encrypted protected login/account details; and vendor documents/images. Contact/access edits, assignments and opaque attachment references use Action Mode's reviewed, versioned writes and Undo. No real vendor, login, access grant or expense assignment was fabricated in production. Existing expenses require explicit assignment. Vendor connection coverage and remaining gaps are tracked in `docs/vendor-connections.md`.

Local validation: 1,258 unit/server tests pass, production build and source/bundle budgets pass, and vendor metadata, protected staging and sorting/assignment workflows pass on all four browser layouts (12 checks). Full branch CI and production verification remain release gates. Universal cross-module reconciliation is not claimed; atomic project/calendar publication remains outstanding.


### September 30 — connected project/calendar continuation

Resumed main a23611e after PR #254. Project calendar visibility is reviewed in the existing project action, with exact versions, permissions, audit and Undo. Calendar entries are read projections of canonical project IDs, not additional stored copies. Family Calendar, Today, Next 7 Days and assistant schedule reads use that source. Calendar links open the exact project. Multi-day windows retain their end dates; the agent keeps them separate from appointment attendance. No project, vendor or expense relationship was mass-assigned in production.

The connection audit found title/date/time matching in calendar overlays. Replaced it with explicit source/provider IDs and recurring occurrence identity. Similar-looking unrelated events remain distinct, including records with no IDs. Known reviewed daily-plan publication IDs preserve explicit lineage. Calendar-visible project edits also require calendar permission for non-administrators. External Apple project publication, signed iPhone Health distribution, and actual household adoption remain separate gates. Release checks and deployed acceptance belong in the corresponding PR and dated audit.

### September 30 — Apple project publication and acceptance evidence

A per-project Apple publish/remove review extends the existing Action Mode calendar journal. The server derives the snapshot from the exact saved project ID, requires administrator review and rejects a changed project version before a new Apple write. Explicit source IDs prevent name matching; existing provider versions protect updates and Undo. A lost response can be recovered without creating a second event. Projects remain authoritative inside Brevity; Apple retains the last reviewed snapshot, so edits require republishing and published projects should be removed from Apple before deletion. Bulk publication is not enabled.

Device and pilot evidence is recorded in `validation/2026-09-30-device-and-pilot-acceptance.md`. Apple Health still requires signed distribution, installation and actual device/consent testing. Measured pilot data currently covers only two days for one member and mixes QA with usage; it cannot certify a completed household pilot.
