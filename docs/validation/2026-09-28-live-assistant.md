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
