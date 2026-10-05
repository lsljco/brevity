# GOV-001 Phase 1 — implementation and release controls

Baseline: 1511811 (PR #296). Implementation plan approved by Larry in the project conversation on October 5, 2026. This is implementation approval, not a claim that Lorenzo approved unresolved household-policy decisions.

## Implemented scope

- Read-only authenticated orchestration endpoint and Ask Brevity read tool.
- Case projections from exact assignment IDs, dated routine IDs, chore occurrence IDs and meal-readiness slots. Original records remain authoritative.
- Separate responsibility state, source availability and orchestration stage. Unrecorded/pending work remains unknown; calendar time alone is not failure evidence.
- Owner-scoped member view; household administrator view. Existing source ownership and accepted coverage are retained, with no fallback assignment.
- Prepared checklists based on saved task standards, targeted clarification and structured, unsent exception previews.
- Reviewed acknowledge, retain preparation, pause and resume case records; reviewed household pause control for the administrator. The retained preparation is an actual snapshot, not a claim of completed household work.
- Existing Action Mode exact-version checks, immutable audit, recovery journal, duplicate-execution prevention and Undo. Source versions and ownership are rechecked before recording assistance.
- Policy and authority descriptions in Today and Policies & Practices. Source workflow links preserve existing editing interfaces.
- Explainable consequence assessment function requiring all four evidenced 1–4 factors; missing factors produce unknown, never a zero or assumed maximum. No threshold-based dispatch.

## Release gate

`BREVITY_GOV001_PHASE1_ENABLED` must equal `true` to activate the pilot. It defaults off. Disabled reads return a policy/activation notice without reading responsibility sources. New orchestration mutations are rejected while disabled. Existing source workflows continue to operate.

Enable only after the approved pilot scope and outstanding governing-policy decisions are recorded. Do not change existing permissions merely to make the feature accessible. Revoke the switch to stop new orchestration reads/mutations. Previously committed actions remain in Audit History; existing conflict-aware Undo remains available.

The household pause is a reviewed persisted control, separate from the deployment kill switch. It prevents new case events. It does not cancel responsibilities or undo completed source actions. Per-case pause prevents acknowledgement/preparation until a reviewed resume.

## Explicitly pending

- Lorenzo's ratification of the policy and routing matrix, delegation boundary, prompt cadence, learning/retention rules, and Recovery Mode authority.
- Background orchestration, accepted support request workflow, outbound delivery, standing grants, automatic escalation, adaptive profiles, recurrence analysis and capacity measurement.
- Health Action Mode adapter, broader domain adapters, cross-pillar conflict graph and Recovery Mode.
- Production activation and production data pilot. No health/private activity data is added to this projection.

Consequence previews remain incomplete where no evidenced severity factors exist; Phase 1 does not manufacture consequence scores. System Health currently reports only visible open/unknown/blocked/unassigned cases and source gaps. It does not claim to measure coverage stability or household capacity.

## Verification

- New unit coverage: feature-off no reads; unknown vs failure; owner visibility; source outages; evidenced risk; permission/stale-source denial; spoofed fields; completed source denial; pause controls; authenticated read-only API; real execution journal, retained preparation snapshot, duplicate execution and Undo.
- Existing full regression suite, production build and bundle/source budgets.
- Browser workflow on desktop, iPhone, iPad portrait and iPad landscape: source ownership, unknown status, useful preparation, exception preview and exact reviewed operation. Backend persistence and Undo tested independently through existing journal code; browser test does not send production messages or mutate household records.

## Rollback

Disable the rollout switch. Preserve cases and immutable audit history. Do not delete existing data or reset source versions. Use ordinary reviewed Undo where applicable, allowing newer edits to block unsafe restoration.
