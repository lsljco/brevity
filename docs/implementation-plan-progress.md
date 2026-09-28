# Brevity implementation plan progress

Source: *Brevity Implementation Project Plan* (Family #1, September 2026). This is an implementation inventory, not a claim of pilot acceptance. Validate each item with signed-in household use before production release.

## Current state

| Plan area | Current implementation | Remaining acceptance work |
| --- | --- | --- |
| Foundation | Git, Netlify preview and production, household login, server-side action resources, audit and Undo, seven-pillar context reads | Document complete data inventory, backup and rollback drills, observability baseline and staging data isolation |
| Household Agent | Central Assistant uses Agents SDK, authenticated pillar reads, structured proposals, Action Mode, permissions | Representative 25–50 prompt evaluation set, error recovery, durable member context, broader approved tools |
| Nutrition Copilot | Conversational meal estimation and reviewed logging; saved meal corrections; own-member targets; dated daily/weekly totals | Family #1 accuracy pilot; full label and brand provenance; fiber, sugar and trustworthy micronutrients; recurring foods; photo and restaurant entry; completion and correction metrics |
| Cross-pillar tools | Agent reads all seven pillars; existing reviewed planning, calendar, project and finance actions | Incremental workout, task, education, spiritual and ministry tools; weekly cross-pillar briefing; permission and failure evaluations |
| Architect Agent | No dedicated improvement workflow | Privacy-conscious instrumentation, issue/proposal schema, concept approval, staging prototype flow, evaluations and release reporting |
| Specialists and rollout | No specialist agents or external cohort | Introduce specialists only when evaluations justify them; module customization and voluntary onboarding require product approval and data isolation |

## Next release candidate: nutrition remainder guidance

- Calculate remaining and over-target values only from confirmed saved meals and member-owned daily targets.
- Show missing targets instead of inventing goals.
- Offer qualitative next-meal guidance without inventing precise nutrition for an unmeasured serving.
- Rank fitting saved planned meals as options without counting them as consumed.
- Count confirmed meals, days logged, and corrected entries over the last seven days; flag exact repeated foods and totals for human review.
- Retain fiber, sugar and sodium values when supported by a label or reliable reference; show unknown if any food lacks a trustworthy value.
- Show revised ingredients and calculated totals in the correction Action Mode review.
- Verify signed-in preview behavior, including an actual meal correction, before asking for production approval.

## Subsequent gates

1. **Nutrition accuracy and provenance:** package-label entry, explicit uncertainty, recurring foods, optional reliable nutrients and a maintained estimation evaluation set. Measure correction rate and time to log.
2. **Agent tools:** add one reviewed domain action at a time, with member authorization, idempotency, audit and Undo. Evaluate intent selection across pillars.
3. **Improvement agent:** proposal and approval workflow backed by usage evidence. Prototypes stay on feature branches; production requires explicit Larry/Lorenzo authorization.
4. **Household configuration and pilot expansion:** only after Family #1 validates adoption and sensitive member data boundaries.

Do not infer Phase 1 success from a passing build or a healthy endpoint. The acceptance criterion is a signed-in member completing a natural-language request, approved action, persisted record and useful follow-up with less work than manual entry.

### Recurring meals and estimate transparency

- Added Repeat meal today from saved history, using server-loaded member-owned foods and totals. Review and confirmation are required; source and destination versions are checked. Existing audit, retry protection, and Undo are retained.
- Ingredient details expose recorded estimate basis and model confidence, explicitly distinguished from label verification.
- Correction calculations discard stale responses after food edits.
- Signed-in preview verification remains required before production approval.

### Voice-first nutrition correction (supersedes manual label entry)

Larry clarified that Brevity must own data entry: spoken consumption → targeted clarification → product/reference lookup → calculation → reviewed save. Removed the package-label form. The SDK now has web search for product references and a calculator clarification result that cannot create a savable estimate. Unanswered questions block subsequent estimate attempts in that turn. Correction starts a conversation and binds recalculated macros to an exact member-owned saved entry from the past seven days. Manual correction fields are removed; audit and Undo remain. Source URLs are retained only when present in supplied references. Live signed-in voice/device and model behavior remain acceptance checks, not proven by mocked tests.
