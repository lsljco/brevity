# Project-plan package verification — 29 September 2026

## Verified baseline and first preview

- Production remains PR #230 merge `1bd733e6ba9f01bb5644e2f5d2f088409bf09775`.
- PR #233 initial commit `0f3977030c53b6ac84504b2a28d122eedaebe83a` deployed successfully to deploy-preview-233.
- GitHub verification run **36554927240** passed on that commit.
- GitHub browser regression run **36554927413**, job **109361686622**, passed on that commit.
- Its Netlify deploy ID is **6abb90deed975500083d45cb**, observed in the deployed page.

## Follow-up package

Adds protected Architect dispatch/workflow preparation, signed background maintenance, conditional recovery command, backup rehearsal, conversation action receipts and source-scope checks. Local validation has **1,165 passing tests**, with a successful production build. A generated prototype has not been executed, and no new service credential or staging permission has been activated.

The maintained live evaluation set has 48 cases. The isolated persistence harness now has 20 checks, including activity, learning, modules, conversation restore/conflicts, metrics and backup restoration. Its in-memory conditional-store run passed; this is **not** a substitute for the actual Netlify Blob run.

## Follow-up CI

Commit `bb232030506ddb3549f979191bfddd5617f29cfb` also passed GitHub verification **36556566453** and browser regression **36556566452**. A further focused source-scope test passed, rejecting generated dependency and workflow changes.

## Initial live blocker (resolved)

The secure sign-in form was submitted and the app briefly displayed Larry, but authenticated APIs remained unavailable. Preview diagnostic commit `6a66f08209c6ea98a64e9c4ba212c2bdcad5a2e4` deployed successfully; the release page explicitly reports “The request did not include a session cookie.” This distinguishes missing browser-session delivery from an invalid stored session, without reading or exposing cookie values. The subsequent manual sign-in succeeded; no authentication boundary was weakened. The evidence below supersedes this initial blocker. Credentials must be entered through the secure browser sign-in handoff, never chat or a test authentication bypass.

At this historical checkpoint PR #233 remained draft and unmerged. Production had not been changed by this package. See project-plan-completion-ledger.md for remaining real-world and integration gates.

## Authenticated live investigation and corrections

Manual household sign-in and secure Netlify sign-in succeeded on 29 September. The release page authenticated Larry against build `46d4243`. Both assistant and release background invocations initially stayed queued. Actual Netlify preview logs identified `MODULE_NOT_FOUND: Cannot find module @netlify/blobs` from the shared CommonJS storage wrapper inside native ESM background artifacts. Explicit external-package configuration alone did not resolve it. Commit `9e7312c` switched native ESM function graphs to a statically imported ESM Blobs wrapper, preserving the same build-bound preview prefixes; subsequent deployed invocations succeeded. Queued jobs now expire conditionally after 90 seconds rather than leaving members waiting for the 12-minute processing limit. A worker that already claimed a job wins the version check.

The first full live run on `9e7312c` was **41/48 structural cases passing**, not release approval. All **20 real Netlify Blob persistence checks passed**, including activity/education/modules save and Undo, conversation isolation/version conflicts/clear recovery, privacy-conscious usage deduplication, backup hash validation and conditional restore.

Failures exposed recipe-test ambiguity, incomplete-source counts reported as zero, incorrect preference recall/write behavior, redundant activity clarification and module proposal payload errors. Corrections preserve unknown totals, make preference recall read-only, supply explicit action contracts, repair invalid technical payloads in a bounded tool loop, and require the agent to finish the requested work rather than merely offer it. The recipe evaluation now specifies cooked foods, medium potato sizes, no added oil, yield and explicit standard-estimate consent; it no longer assumes those missing facts. Preference recall receives the saved value in canonical context, so a redundant read tool is no longer required by that structural check.

Deployed UI verification completed conversation reload, clear and restore. A completed 20-minute synthetic walk reached the actual review screen, was confirmed, appeared in Action Mode audit history and was successfully undone. No production household record was changed. Photo extraction correctly read all seven printed values from a synthetic nutrition label; the conversational handoff initially failed to summarize them and was corrected separately.

The live Netlify configuration revealed the older shared `BREVITY_AI_MODEL=gpt-5.4-mini` override. The household agent and evaluation now use dedicated `BREVITY_AGENT_MODEL` (default `gpt-5.6-sol`, low reasoning), without changing other workflows, account access or billing limits. This has higher per-token cost than the prior mini model. Model capability and supported reasoning settings were verified against OpenAI model documentation.

Current implementation commit `e709772` has **1,173 local tests passing** and a successful build. Its live model/evaluation/UI rerun is pending. At this checkpoint PR #233 remained draft pending live acceptance; see the final candidate result below.

## Additional live evidence

- The complete module UI flow passed on `e709772`: new custom module proposal, administrator review, save, navigation and workspace after reload, then audited Undo with removal from navigation.
- Scheduled preview backup was manually invoked through Netlify. Background request `910705be` logged job `d7f79a28-4fbe-44b8-a26c-dcbaa07cc215`, `backup`, `complete` at 04:33:07 PDT (11:33:07 UTC). This verifies dispatch and execution; it is not evidence of the next automatic production schedule.
- The original four-ounce sausage and toast request reached a product-identity clarification. A six-ounce Eckrich Original, two plain Nature’s Own Honey Wheat slices and one 11-fl-oz Premier Protein Chocolate follow-up reached review with 840 calories, 54 g protein, 44 g carbohydrate and 49 g fat. The per-food review showed sausage 6 oz / 2 oz = three servings, two single-slice bread servings and one bottle serving. It disclosed the retailer-label variant limitation. These are the retrieved labels in this test, not universal values for all product variants. The meal was saved only in the isolated preview for correction testing.
- That researched meal took 225,518 ms inside the agent. Commit `9eca297` adds a 45-second cancelable deadline to each focused source-finder run, low reasoning for that focused task and content-free per-tool progress logs. It has 1,174 passing local tests and a successful build. Live correction/latency and photo handoff verification remain in progress.
- The second complete evaluation run is `f9bdf04d-56bd-48df-b770-903a776c861e`, bound to `e709772`. The removal case exposed a contradictory fixture: the request said breakfast was logged twice, but only one entry existed. The agent correctly asked before erasing the only breakfast. Commit `7f6b78c` supplies two entries and will be verified by a targeted rerun; the expected reviewed removal was not weakened.

## Continued verification on 29 September

- Runtime candidate `9eca297` was followed by evaluation-only commit `7291f8215c0564dd7ff01a33f526c336abf490b1`. All **1,175 local tests** and the production build passed. Verification CI **36564021428** passed; browser CI and the final deployed run were still running when this entry was written.
- The completed prior live run on `e709772` returned **46/48 structural passes**, with all 20 real storage checks passing. Reviewed both flagged outputs: duplicate removal correctly refused to erase the only fixture breakfast (fixed by supplying the stated duplicate), and the completed-workout proposal had the right owner/date/type/30-minute duration without a redundant read. The workout evaluation now checks those exact semantics and rejects changed duration, other owner/date and invented calories. It still requires the reviewed-action tool and production contract validation. Full prior evidence: `release-pr233-prior-20260929.json`.
- Final deployed run **f7cb438a-6591-4e55-8152-0209e604d247** is bound to `7291f82`; results must be recorded before merge.
- Photo-to-conversation handoff passed with the fictional attached label: serving 2 oz (56 g), 190 calories, protein 6 g, carbohydrate 2 g, fat 16 g, sodium 550 mg and potassium 100 mg. The agent summarized all seven requested values, identified them as attached-label evidence and prepared no write. This proves legible-label extraction on the sample, not recognition accuracy for arbitrary photos.
- The saved preview meal correction from 6 oz to 4 oz sausage preserved both bread slices and the shake, yielding 660 calories / 48 g protein / 40 g carbohydrate / 34 g fat. A read-only follow-up after reload found exactly one entry and matching daily totals. Netlify runtime logged the correction agent at **47,775 ms** (request `29d97cb0-29d5-4edf-a20f-2b94cdb8d29b`); this is one measured correction, not a universal latency promise or a like-for-like benchmark against first-time research.
- UI Undo of that correction succeeded and was audited. Attempting to Undo the older original meal was correctly rejected after the newer version; no concurrency safeguard was weakened. A fresh natural-language removal found the current exact test entry, required typed confirmation, completed and remained auditable/reversible. The synthetic meal was removed from preview; production records were untouched.
- Architect credential activation and protected staging remain blocked on credential provisioning and explicit security-access approval. A generated branch may contain arbitrary application code: existing production-capable Netlify credentials must never be supplied to that coding environment. Physical iPhone voice acceptance and observed household adoption remain real-world gates.

- A separate live metrics question exposed a reporting defect: no failed reads was incorrectly described as full seven-day instrumentation coverage. Commit `5b0dbcdefee4281be2ab002e91f05d2a2fe16a95` adds explicit recordedDays and missingDays alongside unavailableDays, with source guidance forbidding that inference. A regression covers all three states. **1,176 tests** and the build pass. The deployed follow-up correctly reported September 29 as recorded, September 23–28 as missing, and no failed reads; it explicitly stated that missing measurements do not imply inactivity or complete coverage. This callback-only correction does not change the maintained synthetic conversation runner.

## Final release-candidate result

All **48/48** maintained live scenarios passed on `7291f8215c0564dd7ff01a33f526c336abf490b1`, and all **20/20** real Netlify Blob persistence checks passed. Completed run: `f7cb438a-6591-4e55-8152-0209e604d247`. Each response was inspected for intent, source boundaries, requested values, permission restrictions and whether a write was appropriate. The calculator in structural cases deliberately returns synthetic numbers; these cases do not claim nutrition-label accuracy. Separate real UI tests above verify source-backed meals, correction, readback, photo extraction and reversible cleanup.

Runtime candidate `5b0dbcdefee4281be2ab002e91f05d2a2fe16a95` adds only explicit metrics coverage fields and its regression test after that full run. Its focused deployed coverage retest passed. All **1,176** local tests and the production build passed; GitHub verification **36565049176** and browser regression **36565049136** both passed on this runtime candidate. The following evidence-only commit does not change executable source.

- Full final evidence: [release-pr233-final-20260929.json](release-pr233-final-20260929.json).
- Previous 46/48 run: [release-pr233-prior-20260929.json](release-pr233-prior-20260929.json).
- Preview verification screenshot: [release-pr233-verification-20260929.jpg](release-pr233-verification-20260929.jpg).
- Publication and production backup observation are recorded in [PR #233](https://github.com/lsljco/brevity/pull/233) after release.

The implementation is ready for the authorized release. This does not activate the separately credentialed Architect coding pipeline, certify physical iOS microphone behavior, complete a real household pilot, or authorize multi-household rollout. Those gates remain explicit in the delivery ledger.
