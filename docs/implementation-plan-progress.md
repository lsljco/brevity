# Brevity implementation plan progress

Source: *Brevity Implementation Project Plan* (Family #1, September 2026). This is an implementation inventory, not a claim of pilot acceptance. Validate each item with signed-in household use before production release.

## Current state

| Plan area | Current implementation | Remaining acceptance work |
| --- | --- | --- |
| Foundation | Git/Netlify CI and previews; authenticated versioned actions, audit and Undo; dedicated release fixture store; correlation/timing diagnostics | Full backup/restore and rollback drills, operational baseline; preview application itself still uses existing household sources |
| Household Agent | Agents SDK; open-ended responses; canonical reads; explicit review preparation and contract repair; bounded provider recovery; 39 maintained evaluation cases; reviewed durable member preferences | Latest preference release needs deployed verification; durable conversation sessions and retention controls remain separate work |
| Nutrition Copilot | Voice conversation/recovery; brand/quantity clarification; product research and readable label evidence; calculated review/save/correction; own-member targets; remainder guidance, seven-day totals, repeated meals; optional reliable fiber/sugar/sodium | Wider label/formulation accuracy coverage and physical iPhone voice acceptance; photo/restaurant intake, additional reliable micronutrients, measured adoption/correction rate |
| Cross-pillar tools | Reads across seven pillars; reviewed dated fitness, education, spiritual and ministry plan edits; assignments, decisions, projects, calendar and supported finance changes | Actual workout/tutoring/mastery records and complete seven-day cross-pillar history; broader domain workflows. Plan edits do not prove activity completion |
| Architect workflow | Reviewed proposals, evidence/benefit/risk/metric schema; Larry/Lorenzo stage approval; exact prototype commit/preview evidence; audited approval and Undo | Automatic friction aggregation, prototype implementation pipeline and measured release/rollback automation; approval register alone does not deploy code |
| Specialists and rollout | Product-only nutrition research specialist justified by live discovery failures | Module customization and voluntary cohort rollout; Family #1 adoption and tenant isolation must precede expansion |

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

### September 29 release audit

- `93a1720`: 34/35 deployed reasoning/contract checks passed. The assignment case falsely claimed creation was unavailable. The explicit `prepare_action_review` SDK tool addresses that failure without bypassing confirmation.
- `d5154a6`: both GitHub verification and browser regression passed. The 37-case deployed suite is in progress; its 13 isolated real-persistence checks passed, including improvement approval/Undo. Do not treat an in-progress suite as release acceptance.
- New preference work: 1,125 local tests and production build pass; member preferences require explicit reviewed requests, own-member authorization and conditional storage. Remember/recall cases expand the set to 39. Deployed acceptance is still pending for these changes.
- Live cases use synthetic calculator values. The earlier 870-calorie/54-g-protein three-food review is separate source-backed evidence, not validation of every food variant.
- No current-turn enhancement was merged into production. Independent sermon PRs #231/#232 landed on main and must be preserved.

These are implementation and verification facts, not a declaration that every phase of the original project plan is complete. Device voice, operational drills and real adoption cannot be certified from local tests or synthetic fixture passes.

The completed `d5154a6` run returned 37 cases: 35 structural passes, one real calendar-outage substitution failure, and one overly strict target-test read requirement. The target proposal correctly changed only protein to 130 g; the evaluation now checks exact payload values instead of requiring an unnecessary read before an explicit one-field patch. The calendar failure is blocked server-side for agent-created plan appointments, with guidance forbidding substitute record types. Response review also identified redundant clarification and schema-field narration; guidance now addresses both. Evidence is retained in `validation/release-37-20260929.json`. None of these fixes is accepted merely because the prior case was reclassified.
