# Project plan delivery ledger — 29 September 2026

Source: Brevity_Project_Plan.pdf (nine pages, reviewed in full). This ledger distinguishes implementation, verification and real-world adoption. It does not certify the entire plan complete.

## Production baseline

PR #230 was merged as `1bd733e6ba9f01bb5644e2f5d2f088409bf09775` and published in Netlify deployment `6abb22ca09bba50008c41062`. Its 40 live structural evaluations and 14 isolated persistence checks passed. The earlier “PR draft / production unchanged” entries in implementation-plan-progress.md are historical.

## Verified release candidate — PR #233

Runtime candidate `5b0dbcdefee4281be2ab002e91f05d2a2fe16a95`: 1,176 local tests, build, GitHub verification and browser regression passed. The full maintained live suite passed 48/48 on preceding runtime `7291f82`, with 20/20 actual persistence checks; the only subsequent runtime change explicitly distinguishes absent usage measurements and passed a focused deployed retest. See [the complete evidence](validation/2026-09-29-project-plan-package.md). Publication and production backup observations are tracked in [PR #233](https://github.com/lsljco/brevity/pull/233).

## Current implementation package

| Plan requirement | Implementation | Release evidence still required |
| --- | --- | --- |
| Household agent and open-ended questions | Existing Agents SDK reasoning, research and reviewed actions, plus explicit capability limits | 48/48 deployed cases passed; response contents inspected |
| Conversation continuity | Member-bound server history, version conflicts, 60-message/30-day retention, seven-day clear recovery, legacy-cache migration | Verified authenticated preview reload, clear/restore, version conflicts and member isolation |
| Voice-first meals and corrections | Existing conversational identity/quantity clarification, retrieved product evidence and server arithmetic; optional photo extraction feeds the same conversation | Meal review/save/correction/readback/Undo and photo handoff passed; broader exact-product sampling and physical iPhone microphone acceptance remain |
| Nutrition beyond macros | Unknown-preserving fiber, sugar, sodium, potassium, calcium and iron; packaged nutrients scale from label servings; hydration is reported activity | Label/portion and seven-value photo sample passed; no universal nutrition-accuracy claim |
| Seven-pillar actual activity | Reviewed own-member workout/progress/maintenance/study/ministry/expense/sleep/hydration records; correction, audit and Undo | Deployed persistence passed; completed walk reviewed, saved and undone through the UI |
| Education evidence | Adult-reviewed observations feed existing learning record and derived mastery | Deployed save/Undo passed; prompted evidence remains distinct from independent evidence |
| Weekly guidance | Shared plans plus own private nutrition/activity and authorized learning; explicit source gaps | Live briefing distinguished plans, reports and missing sources; actual household usefulness remains a pilot measure |
| Module configuration | Reviewed enable/disable/rename/reorder; custom modules provide member-note workspaces | Custom module reviewed/saved, present after reload and undone in live UI; specialized new apps still need implementation |
| Usage-driven improvements | Content-free counts/latency/ratings, measured-evidence tool, concept approval, implementation packet, prototype/release evidence and measurement stages | Preview metrics retrieval passed with recorded/missing/failed date coverage; establish real baseline after deployment |
| Staging | Build-bound per-preview stores, no production data fallback; Apple Calendar disconnected, bank linking and OneDrive publishing blocked | Deployed preview isolation and external-write guards verified by runtime/UI/persistence checks |
| Recovery | Scheduled immutable per-record snapshots of shared state, plans, meals and action history; hash validation and conditional restore primitive | Real isolated Blob restore passed; manual preview scheduled dispatch completed in Netlify logs; verify production schedule after release |

## Operational boundaries

Preview authentication intentionally uses the existing household identity service. Household application data and Action Mode journals use separate stores. Preview sessions do not confer a second household or tenant boundary. No production data is copied into staging automatically. Calendar availability in preview is therefore intentionally different from production.

Usage measurements exclude message text, photo content, food values, bank values and student evidence. Member metrics are private; Larry/Lorenzo administrators can inspect household totals. Counts begin with deployment and are not historical adoption measurements or causal conversion rates. Metrics expire after 90 days. Assistant job payloads, including optional images, are pruned after one day. Scheduled cleanup runs in production; preview stores require explicit environment retirement because Netlify does not run preview schedules.

Recovery snapshots contain sensitive household records and stay in the same protected Netlify project. They exclude authentication credentials, bank/OneDrive tokens, conversations and generated media. They are per-record captures, not an atomic cross-store snapshot. The restore primitive is operator-only and requires an exact content hash plus current destination version; it is not a public restore endpoint. Complete backup runs retire snapshots older than 30 days. A reviewed operator restore command records the before-image and rejects stale versions; deployed rehearsal and production schedule observation remain required.

## Remaining gates — not completed by a build

1. **Release candidate verified:** deployed assistant behavior, all 48 scenarios, all 20 isolated persistence checks and representative UI confirmation flows passed. Record publication and production smoke results in PR #233.
2. **Recovery rehearsal verified:** the runbook, real isolated Blob restoration, stale-write rejection and preview scheduled dispatch passed. Production scheduler activation/execution must be observed after publication; a manual run is not proof of a future automatic run.
3. The Architect implementation packet, guarded dispatch service and isolated coding workflow are prepared. They are not activated: scoped credentials, a protected review environment and separately credentialed staging must be configured and a synthetic full pipeline run verified. The workflow defaults to verified artifacts, with branch/PR creation disabled. It never merges or publishes production. See architect-and-recovery-operations.md.
4. Actual household pilot: voice on Larry's physical device, useful daily use, correction/friction measurement and member feedback over time. Do not fabricate successful use or ask members to enter macros.
5. Expand to additional voluntary households only after the pilot gate, tenant/auth/storage isolation review and explicit onboarding consent. The current identity system is one named household, not production multi-tenancy.
6. The human learning and competitive-research workstream requires actual participation and evidence. Reading material and a learning sequence are preparation, not completed study or a proven commercial advantage.

## Learning sequence tied to this implementation

- Trace a spoken meal from transcription through clarification, research, calculation, reviewed action, persistence and Undo. Reproduce an ambiguous portion and a failed source without changing household data.
- Inspect an SDK tool and a server authorization check. Explain why a capable general conversation does not imply unrestricted database or deployment permissions.
- Review a failed evaluation response and write an acceptance criterion based on behavior, not tool count alone.
- Use real pilot metrics to prepare one improvement problem statement. Review requirements, data access, tests, staged rollout and rollback before implementing it.
- Compare alternative household workflows using the same real tasks and consented observations: time, correction rate, burden, usefulness and data controls. Do not infer product superiority from a feature checklist.
