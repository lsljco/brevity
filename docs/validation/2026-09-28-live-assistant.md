# Signed-in preview validation — September 28, 2026

Preview: PR #230. These are actual signed-in assistant requests and Netlify function observations, not the synthetic evaluation harness. No test meal or recipe changes were confirmed.

## Failures reproduced

- On `b92e4a9`, the original smoked-sausage/toast request returned numerical macros without calling the calculator. The background log recorded only `get_pillar_records` (correlation `db4a402e-13cf-4868-ae65-f5e699e74c99`). A branded follow-up repeated those unsupported numbers and did not create the requested review.
- On `822b9df`, the request used `estimate_meal_nutrition` and returned an actual proposal. However, missing packaged-product identities were still accepted by the calculator.
- The same candidate exposed a follow-up regression: `TypeError: item.content.map is not a function` in the SDK Responses converter. Assistant-history strings were not valid SDK assistant message content. Correlation `94ce25d1-94bf-4834-93ce-97cc9dad1bec`.

## Corrections

- Request instructions now belong to agent instructions. Household context and conversation remain data with their original roles.
- SDK `user()` / `assistant()` helpers convert conversation content; an integration test exercises the installed SDK request converter.
- New/corrected meal totals must come from the calculator; preparing a review is distinguished from committing a save.
- Calculator output now includes food kind, explicit quantity confirmation and packaged-product identity confirmation. Server validation rejects unresolved quantities, unresolved packaged products without approximate-estimate consent, and packaged foods without a matching supplied reference or consent. Plain whole foods require no brand.

Candidate `12a94bd`: 1,095 local tests pass; build passes. Live retest pending. Production release remains blocked on live acceptance. The 30-case synthetic model evaluation set and physical microphone testing have not run in this validation session.

## Additional live findings

- `12a94bd` correctly withheld a meal proposal pending clarification (correlation `24607d58-fb25-4d4c-bba1-f85a101cfebb`). Its clarification misattributed a product page to the user; wording and source-ownership instructions were corrected in `0ecb01b`.
- The branded follow-up no longer hit the SDK converter error, but asked the member to provide a URL/label. Missing-reference handling is now an internal `NUTRITION_REFERENCE_REQUIRED` result: the agent must research and retry, or obtain consent for an explicitly approximate estimate when its research cannot resolve the source. It must not request label transcription.

## Confirmed live improvements

- Open-ended correlation/causation question produced a substantive answer with an everyday example, without a capability menu.
- Saved recipe lookup returned the exact title and ingredient list for Smoked Turkey Breast + Garlic Kale without asking for an ID or pasted record. No recipe change was made.
- On `90f1bed`, the original ambiguous sausage/toast request asked about the sausage brand/variant and preparation weight. It did not return guessed macros or a proposal.
- Latest full regression run: 1,096 tests passed; production build passed. Branded calculation/review retest is pending.

## Review-level provenance finding

The clarified 4 oz sausage/two-slice meal reached an actual Action Mode review with 520 calories and 16 g protein. Inspection of its warnings revealed brand home pages and typical values had been treated as sufficient product evidence. This is not an exact-label accuracy pass. Added server rejection of homepage URLs and a required reference-quality classification; approximate packaged-food references require explicit estimate consent. No proposal was applied.

## Portion arithmetic finding

Changing the draft to 6 oz sausage plus one 11-fl-oz, 30-g-protein shake and two slices of toast returned 82 g protein: the single shake had effectively been doubled. Added structured consumed amount/unit and label serving amount/unit/macros. The server now converts compatible mass/volume units and multiplies per-label macros itself, overriding model whole-portion totals. Regression covers a model-returned 60 g protein for one shake being corrected to the label's 30 g, plus 6 oz sausage scaled from a 2 oz label. Incompatible serving units fail closed.

## Server-arithmetic live retest

Candidate `b8f8a54` returned 870 calories and 54 g protein for the three-food meal, counting the shake once (30 g) and sausage as three label servings (18 g). Correlation `a8b6d816-efbe-4ed8-b564-972f3cfa096c`; calculator called once; no runtime error. The model omitted the requested proposal despite saying a review was prepared. Added one bounded repair pass using the existing SDK history and calculated estimate IDs; no recalculation or save is performed by that pass.

This numerical result is not certified exact-label accuracy. Independent manufacturer-page inspection showed the Eckrich Original Skinless Rope page lists 15 g fat and 5 g carbs per 2 oz, differing from the agent's cited 17 g fat and 2 g carbs. Product reference matching and evidence quality therefore remain a release gate even when serving arithmetic is correct. Manufacturer source: https://eckrich.sfdbrands.com/en-us/products/smoked-sausage-rope/original-skinless-rope/ (checked September 28, 2026).

## Evidence retrieval correction

The nutrition server now discards agent-authored product-reference summaries and retrieves the public URLs itself using the existing DNS-pinned, private-network-blocking, size-bounded recipe fetcher. Homepages and unreadable/incomplete nutrition pages cannot count as evidence. The calculator receives fetched page text, and missing evidence returns to agent research or explicit approximation consent. Approximate items retain no exact-label source claim and carry a server-generated uncertainty warning. This prevents invented source summaries from authorizing the earlier incorrect label values.

## Final observed state — candidate 5096e74

- Explicit consent to approximation produced a real Action Mode proposal and its review dialog: 870 calories, 54 g protein, 36 g carbs and 56 g fat. The shake counted once. Approximation was prominently disclosed; this is a workflow/arithmetic check, not exact-label accuracy certification.
- The first conditional approximation consent was unnecessarily requested again; reducing repeated clarification remains a conversation-quality follow-up.
- No test meal or recipe change was applied. No PR merge or production release occurred.
- 1,100 regression tests pass; build passes. Preview deployment succeeded.
- Remaining acceptance: exact-product evidence coverage and macro accuracy across variants; physical-device voice; approved save, persisted record, correction and Undo; the full synthetic 30-case model evaluation set.

![Live review, not applied](preview-230-live-review.jpg)

## Follow-up: evidence extraction and consent — candidate 6dc41c0

- Preserves label neighborhoods and structured nutrition text before truncating long pages. Regression covers a label beyond 24 KB of navigation/reviews.
- Failed reference URLs and reasons are returned to the agent so it can select a different source. Agent-authored summaries remain excluded.
- Conditional approximation consent is retained for the current meal, not carried to unrelated meals.
- Signed-in live request reached a proposal in one turn without repeated consent: correlation `9898fa39-0a0b-42cb-b1f6-ff567b9ebf52`, one calculator call, no runtime error, 32.5-second agent run. Returned 870 calories and 54 g protein as an estimate. Carbohydrate/fat values differed from earlier approximate runs; exact-label accuracy is still unproven and remains a release gate.
- The actual review disclosed unavailable exact labels for Eckrich and Nature's Own. No test meal was saved.
- Full suite: 1,102 passing; build passes. Review ingredient display now retains food names and brands from the measured input rather than displaying bare portion amounts.

### Direct product-label reading (continuation)

Baseline on `621ba68`: a signed-in request for the three explicitly identified foods, exact labels, and review only ended without a proposal. The assistant cited an unrelated Eckrich PDF, stopped at an incomplete bread search result, substituted an 11.5-fl-oz shake label for an explicitly stated 11-fl-oz bottle, and offered to keep searching. It incorrectly said review was prepared. Netlify request `4dec51d3-ab56-446d-8f46-e4d0cec257e3` reported `answered`, 8,652 ms, no function tools, no unavailable household sources. This is a research/reasoning failure, not an endpoint exception.

Added `read_product_nutrition`: the SDK agent can now inspect actual server-fetched product-page text and explicit retrieval failures before estimating. Successful evidence and failed fetches are cached only within this run and reused by the calculator; model-authored reference summaries cannot populate that cache. Guidance requires research for each food, a relevant alternate source when the manufacturer text is incomplete, and exact package-volume matching. The run remains bounded (12 turns). Local verification: 1,104 tests pass and build passes. Runtime deployed as `2a245cf`; live acceptance recorded below. No meal was applied during this investigation.

The first live request on `2a245cf` failed before tool execution. Netlify request `4e9fa24c-dca0-4166-bc86-ad5723dcd980` recorded OpenAI HTTP 400 `invalid_function_parameters`: `read_product_nutrition` emitted JSON Schema `format: uri`, which this Responses strict-tool contract rejects. Fixed in `49630ef` by using bounded strings and retaining server URL/public-address validation. The SDK test now checks the actual emitted tool schema for this regression. This deployment was not treated as accepted based on local tests.

On `49630ef`, request `be5ce565-0863-4f43-a718-0a1274af728c` completed in 43,088 ms with `read_product_nutrition: 1` and `estimate_meal_nutrition: 1`, no endpoint error. Acceptance still failed: incomplete source discovery, another offer to keep searching, and an 11.5-fl-oz shake label presented against an 11-fl-oz request. A diagnostic follow-up supplying the real Eckrich manufacturer product URL successfully retrieved its full label (2 oz / 56 g, 190 calories, 6 g protein, 5 g carbohydrates, 15 g fat). This isolates the Eckrich gap to discovery/selection rather than an inability of Netlify to fetch that page.

Added focused product-only source discovery in `9029e7d`: a bounded SDK research task receives only the product description, uses web search, and supplies up to three candidate URLs for server retrieval. It does not receive household records, compute macros or write data. Failed research returns an explicit unavailable result to the main agent. The main agent retains final identity/variant checking and Action Mode review. Full local suite: 1,106 passing tests; build passes.

Initial focused-research live request `73dd843e-f438-4eec-ae26-0bfd87f0dea7` called `find_product_nutrition` three times but still stopped without a review. Diagnostic retry `2c7bc7bc-bdee-41d7-9b4d-ef9c95fca992` found the correct Eckrich manufacturer page; Target/Walmart candidates lacked readable label text. Added one automatic rediscovery attempt when all fetched candidates fail, passing actual failed URLs so the researcher can choose alternatives, plus required web-search use in the product-only task. The retry is bounded and does not transfer the work to the member. Runtime commit `3aca3bb`.

On `3aca3bb`, request `121db552-6eb0-4afe-b918-f476095078d7` completed in 50,956 ms, invoking three focused lookups, one automatic discovery retry and one calculator call. Bread/shake sources were reported as found, but the calculator rejected a different sausage variant and the parent again offered further research. Added one tool-internal recovery for `NUTRITION_REFERENCE_REQUIRED`: research the unresolved product with previous URLs excluded, fetch the alternate evidence, then recalculate without relaxing exactness or approximation consent. Also fixed the mismatch between ten accepted reference URLs and only four fetched URLs, which could drop other foods' evidence during recovery. `dced88e`: 1,109 tests pass; build passes. Live acceptance still required.

### Latest live result — review reached on `dced88e`

The same clean-conversation exact-label request reached a real Action Mode proposal and its confirmation dialog, with no manual label entry, no approximation consent, and no request to manage further research. Nothing was applied. Netlify request `4eced0e0-7d68-4453-9e02-19a0c87b004f`: outcome `proposal`, 60,394 ms agent / 66,313 ms function, three focused lookups, one discovery retry, one calculator call, no unavailable household sources or error category. The additional calculator-reference recovery was not needed in this particular successful run.

Review output: 870 calories, 54 g protein, 44 g carbohydrates, 49 g fat. Item outputs were sausage 570/18/15/45, shake 160/30/3/3, bread 140/6/26/1 (calories/protein/carbs/fat). Source URLs were the Eckrich Original Skinless Rope manufacturer page, Premier Protein Vanilla manufacturer page, and Whole Foods Nature's Own Honey Wheat product page. Screenshot: `preview-230-source-review.jpg`.

Independent checks confirmed the Eckrich per-2-oz label (190/6/5/15) and Premier's explicit 11-fl-oz panel (160/30/3/3). Premier's page contains BOTH 11 and 11.5-fl-oz panels with those same four macros; earlier assistant statements that only the 11.5 panel was available were incomplete research, not proof that the 11-fl-oz product lacked a label. The external verification tool could not fetch the Whole Foods page (403), so the bread result is recorded as the deployed calculator's retrieved-source result, not independently certified here. Other current retailer labels for the newer bread formulation show 14 g rather than 13 g carbohydrate per slice; formulation/source consistency remains a release-review item.

This is one successful live meal-to-review test, not approval to merge or a pass for every food/variant. Remaining gates include repeat consistency across product variants, physical-device voice, approved save/persistence/correction/Undo in isolated data, and the full 30-case live evaluation. PR230 remains draft and production unchanged.
