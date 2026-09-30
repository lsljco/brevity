# Label and response acceptance — September 30, 2026

## Real manufacturer-label sample

The authenticated production assistant on main `68b4ef24b9c1be065d09731b0e8118219838a1a8` was asked for a hypothetical comparison, explicitly prohibiting a meal log or action proposal. It independently retrieved manufacturer evidence. The reviewer separately retrieved the US manufacturer's labels through web search; direct page fetches returned 502, while indexed official page text exposed the labeled servings. This is manufacturer-web-label verification, not inspection of a physical package from the household.

| Requested variant and portion | Label basis / multiplier | kcal | Protein g | Carbs g | Fat g | Sodium mg | Calcium mg | Potassium mg |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| FAGE Total 0% plain, 150g single-serve cup | 150g / 1× | 80 | 16 | 5 | 0 | 55 | 180 | 230 |
| FAGE Total 0% plain, 255g from 32oz tub | 170g / 1.5× | 135 | 27 | 7.5 | 0 | 97.5 | 300 | 390 |
| FAGE Total 5% plain, 170g from 32oz tub | 170g / 1× | 160 | 15 | 5 | 9 | 60 | 200 | 260 |

Sources reviewed September 30: [FAGE US 0%](https://usa.fage/products/yogurt/fage-total-0), [FAGE US 5%](https://usa.fage/products/yogurt/fage-total-5). The tub labels supply 90 kcal/18g protein for 0% and 160 kcal/15g protein for 5%, per 170g. All 21 returned nutrient values matched the independently retrieved labels and scaling. Brevity explicitly qualified the decimals as calculations from rounded labels and returned source URLs. No action was prepared or applied.

A separate hypothetical “one bowl of FAGE yogurt” request returned a clarification for variant, grams and toppings instead of guessed nutrition or a savable action. This extends the earlier sausage/bread/shake and synthetic-photo checks with package-size, fat-content and fractional-serving coverage. It does not establish universal formulation accuracy, physical-photo accuracy or a clinical dietary recommendation. Wider real-package checks remain ongoing product QA, not a claim that every food has been verified.

## Readability defect found through actual use

The correct comparison appeared as literal Markdown table rows, and source links appeared as raw link syntax. This affects general comparisons and research across pillars, not only food.

The renderer now uses semantic table headers/cells in a bounded, keyboard-focusable horizontal scroll region. HTTP(S) source links are clickable with separate-tab/no-opener behavior. It continues rendering HTML and unsupported schemes as inert text; no remote images are loaded from the response. Existing paragraph, bold, code and list behavior is retained. Malformed table rows remain visible rather than being dropped.

Validation: 1,221 tests and production build passed locally. Eight focused browser checks passed across desktop, phone, tablet and landscape tablet, checking semantic cells, links, inert HTML/images/executable destinations and viewport containment. The initial run exposed a pre-existing clock-test race (real time advanced while the test expected exactly 21 seconds); pausing the mock clock makes that exact requirement deterministic. CI, preview and publication evidence are recorded in the corresponding release PR.

## Outcome measurement defect

The read-only seven-day usage query correctly separated recorded dates, missing measurements and failed reads. It also reported zero clarifications immediately after a real clarification. Code inspection confirmed that diagnostics counted only calculator-produced clarification questions, ignoring the agent's explicit `needs_information` completion status. `blocked` responses were also labeled answered.

Classification now respects these explicit statuses. Blocked requests have a separate counter from technical failures. New events record classification version 2, and the summary reports legacy requests whose old answered outcomes cannot be retrospectively corrected. No historical message content is mined or rewritten. Regression checks exercise actual SDK-run results for answered, needs-information and blocked statuses plus persisted mixed-version metric summaries.

Comparison read-aloud uses the same parsed rows and speaks each column label and value. Markdown source links are spoken by their label; plain action-review text is preserved.
