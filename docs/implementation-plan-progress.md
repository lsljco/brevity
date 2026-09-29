# Brevity implementation plan progress

Source: *Brevity Implementation Project Plan* (Family #1, September 2026). This is an implementation inventory, not a claim of pilot acceptance. Validate each item with signed-in household use before production release.

## Current state

| Plan area | Current implementation | Remaining acceptance work |
| --- | --- | --- |
| Foundation | Git, Netlify preview and production, household login, server-side action resources, audit and Undo, seven-pillar context reads | Document complete data inventory, backup and rollback drills, observability baseline and staging data isolation |
| Household Agent | Central Assistant uses Agents SDK, authenticated pillar reads, structured proposals, Action Mode, permissions | Run and review the implemented 30-case evaluation set; validate error recovery; durable member context and broader approved tools |
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

1. **Nutrition accuracy and provenance:** agent-led product reference lookup, explicit uncertainty, recurring foods, optional reliable nutrients and a maintained estimation evaluation set. Measure correction rate and time to log.
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

### General questions and saved recipe discovery

- The agent is instructed to answer open-ended questions, reason, draft and research regardless of the supported write-action list. It must state actual execution limits rather than invent capabilities.
- Search tool distinguishes recipes, planned meals and recent consumption; complete canonical recipe library is loaded server-side. Members should not be asked to retrieve database IDs or paste already saved records.
- Added reviewed recipe title/ingredient updates for custom and built-in recipes. Shared library changes propagate to plans referencing the recipe; consumed logs are unchanged. Title-only edits preserve macros; ingredient changes use calculated batch yield.
- Library writes use the existing versioned custom-library record, conditional writes, journals, audit and Undo. Creating/importing meals preserves built-in recipe overrides. UI refresh listens for recipe changes.
- Screenshot reproduction is covered using a matching test recipe; real household record discovery and live conversational behavior still require signed-in preview validation.

### Reliability, diagnostics and conversation evaluations

- Recipe, calendar, target and seven dated nutrition reads run independently with bounded waits. Unavailable data remains unknown and cannot authorize changes to that source. Partial history includes explicit missing dates.
- Background assistant requests forward the site host for Apple Calendar reads; previously the background call omitted it.
- Added run diagnostics: correlation ID, elapsed time, outcome, function-tool counts and number of unavailable sources. These diagnostic events omit conversation content, identities, arguments and raw provider errors.
- Added 30 synthetic conversation scenarios spanning general assistance, all seven pillars, nutrition follow-ups, record discovery, permission boundaries and source failures. `node scripts/evaluate-household-agent.mjs` lists them without model calls. `--live --id CASE_ID` runs one; `--live --all --out /absolute/report.json` explicitly runs the set. Requires a configured API key and incurs provider usage. The runner never calls household persistence or action execution.
- Automatic evaluation checks cover response structure, tool usage and allowed action types; human review is required for correctness and usefulness. A listed scenario is not a passed live evaluation.

### Signed-in API validation

Live preview requests now use the deployed OpenAI configuration through the authenticated app; a local API key is not required for this path. See `validation/2026-09-28-live-assistant.md` for observed failures, corrections and acceptance status. Production release still requires live acceptance rather than local-test results alone.

### Product research before calculation

Added an SDK product-page reader that returns actual retrieved label text and source failures. The calculator reuses its server-held evidence within the same request. The agent is instructed to research every packaged food, try a matching alternate source when needed, and distinguish package-volume variants. Baseline live evidence showed early research termination and an omitted review rather than an API exception. Exact-label accuracy remains an acceptance gate; see the live validation report.

A subsequent live diagnostic successfully read the Eckrich manufacturer label when given its URL, isolating a source-discovery weakness. Added a bounded product-only SDK research task that finds candidate manufacturer/retailer URLs and verifies their readable evidence before returning to the household agent. It receives no household records and performs no writes. Full suite now has 1,106 passing tests; exact-label and variant behavior still require live acceptance.

Latest signed-in full meal test on `dced88e` reached actual Action Mode review: 870 calories and 54 g protein, with source-backed item calculations and no manual macro work. Automatic discovery retry was exercised. The full suite has 1,109 passing tests and the build passes. This is one live review pass; bread formulation/source consistency, wider variant coverage, device voice, isolated persisted-save/Undo, and the 30-case live evaluation remain. No merge or household meal write was performed.
