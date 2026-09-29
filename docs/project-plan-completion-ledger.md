# Project plan delivery ledger — 29 September 2026

Source: Brevity_Project_Plan.pdf (nine pages, reviewed in full). This ledger distinguishes implementation, verification and real-world adoption. It does not certify the entire plan complete.

## Production baseline

PR #230 was merged as `1bd733e6ba9f01bb5644e2f5d2f088409bf09775` and published in Netlify deployment `6abb22ca09bba50008c41062`. Its 40 live structural evaluations and 14 isolated persistence checks passed. The earlier “PR draft / production unchanged” entries in implementation-plan-progress.md are historical.

## Current implementation package

| Plan requirement | Implementation | Release evidence still required |
| --- | --- | --- |
| Household agent and open-ended questions | Existing Agents SDK reasoning, research and reviewed actions, plus explicit capability limits | Rerun maintained conversation set on this commit |
| Conversation continuity | Member-bound server history, version conflicts, 60-message/30-day retention, seven-day clear recovery, legacy-cache migration | Deployed cross-session history and clear/restore |
| Voice-first meals and corrections | Existing conversational identity/quantity clarification, retrieved product evidence and server arithmetic; optional photo extraction feeds the same conversation | Exact-product sampling and physical iPhone microphone acceptance |
| Nutrition beyond macros | Unknown-preserving fiber, sugar, sodium, potassium, calcium and iron; packaged nutrients scale from label servings; hydration is reported activity | Live label/portion checks; no universal nutrition-accuracy claim |
| Seven-pillar actual activity | Reviewed own-member workout/progress/maintenance/study/ministry/expense/sleep/hydration records; correction, audit and Undo | New isolated persistence checks and live tool routing |
| Education evidence | Adult-reviewed observations feed existing learning record and derived mastery | Deployed save/Undo; prompted evidence must not become independent |
| Weekly guidance | Shared plans plus own private nutrition/activity and authorized learning; explicit source gaps | Live briefing relevance, no inferred completion |
| Module configuration | Reviewed enable/disable/rename/reorder; custom modules provide member-note workspaces | Navigation persistence and Undo; specialized new apps still need implementation |
| Usage-driven improvements | Content-free counts/latency/ratings, measured-evidence tool, concept approval, implementation packet, prototype/release evidence and measurement stages | Establish actual baseline after deployment |
| Staging | Build-bound per-preview stores, no production data fallback; Apple Calendar disconnected, bank linking and OneDrive publishing blocked | Verify deployed prefix and external-write guards |
| Recovery | Scheduled immutable per-record snapshots of shared state, plans, meals and action history; hash validation and conditional restore primitive | Isolated Blob restore rehearsal; verify production scheduler after release |

## Operational boundaries

Preview authentication intentionally uses the existing household identity service. Household application data and Action Mode journals use separate stores. Preview sessions do not confer a second household or tenant boundary. No production data is copied into staging automatically. Calendar availability in preview is therefore intentionally different from production.

Usage measurements exclude message text, photo content, food values, bank values and student evidence. Member metrics are private; Larry/Lorenzo administrators can inspect household totals. Counts begin with deployment and are not historical adoption measurements or causal conversion rates. Metrics expire after 90 days. Assistant job payloads, including optional images, are pruned after one day. Scheduled cleanup runs in production; preview stores require explicit environment retirement because Netlify does not run preview schedules.

Recovery snapshots contain sensitive household records and stay in the same protected Netlify project. They exclude authentication credentials, bank/OneDrive tokens, conversations and generated media. They are per-record captures, not an atomic cross-store snapshot. The restore primitive is operator-only and requires an exact content hash plus current destination version; it is not a public restore endpoint. Retention/retirement of recovery snapshots must be operationally configured before calling the recovery program complete.

## Remaining gates — not completed by a build

1. Deploy this package, inspect actual function behavior and finish isolated persistence/UI verification before considering merge.
2. Complete and verify the operational recovery runbook, including a real isolated Blob restoration and a production backup schedule observation.
3. The Architect can prepare and govern implementation packets. It cannot yet autonomously write code to GitHub, run an isolated coding environment, create a prototype PR or deploy it from inside Brevity. A dedicated least-privilege integration and verified coding pipeline remain engineering work; approval records are not that pipeline.
4. Actual household pilot: voice on Larry's physical device, useful daily use, correction/friction measurement and member feedback over time. Do not fabricate successful use or ask members to enter macros.
5. Expand to additional voluntary households only after the pilot gate, tenant/auth/storage isolation review and explicit onboarding consent. The current identity system is one named household, not production multi-tenancy.
6. The human learning and competitive-research workstream requires actual participation and evidence. Reading material and a learning sequence are preparation, not completed study or a proven commercial advantage.

## Learning sequence tied to this implementation

- Trace a spoken meal from transcription through clarification, research, calculation, reviewed action, persistence and Undo. Reproduce an ambiguous portion and a failed source without changing household data.
- Inspect an SDK tool and a server authorization check. Explain why a capable general conversation does not imply unrestricted database or deployment permissions.
- Review a failed evaluation response and write an acceptance criterion based on behavior, not tool count alone.
- Use real pilot metrics to prepare one improvement problem statement. Review requirements, data access, tests, staged rollout and rollback before implementing it.
- Compare alternative household workflows using the same real tasks and consented observations: time, correction rate, burden, usefulness and data controls. Do not infer product superiority from a feature checklist.
