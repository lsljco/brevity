# Project plan delivery ledger — updated 30 September 2026

Source: Brevity_Project_Plan.pdf (nine pages, reviewed in full). This ledger distinguishes implementation, verification and real-world adoption. It does not certify the entire plan complete.

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
