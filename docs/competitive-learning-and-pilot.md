# Competitive learning and household acceptance — September 30, 2026

This is a completed desk-research baseline and a runnable household exercise. It is not a completed user study or evidence that Brevity outperforms another product. No household data was uploaded to these services, no accounts were created, and no purchases were made.

## Observed patterns and Brevity decisions

Official product documentation was reviewed September 30, 2026. Product claims below describe advertised capabilities, not independently tested quality.

| Product / source | Observed pattern | Decision for Brevity |
| --- | --- | --- |
| [Cozi features](https://www.cozi.com/feature-overview/) | Shared color-coded calendar, task and shopping lists, recipe-to-shopping flow, and a daily agenda. | Keep Today useful without conversation. Spoken answers should identify the person and source; a shared calendar entry must not automatically become the speaker's commitment. |
| [Ohai features](https://www.ohai.ai/features/) and [how it works](https://www.ohai.ai/how-it-works/) | Advertises extracting school and other schedules from documents and coordinating calendar/tasks through an assistant. | Favor natural-language requests and connected data over repeated manual entry. Any future inbox/document ingestion needs scoped consent, provenance, duplicate detection and reviewed changes; this research does not activate it. |
| [Ohai privacy notice](https://www.ohai.ai/privacy-policy/) | Describes AI plus human assistance and processing of connected email and interaction data, with stated use restrictions. | Explain actual processing boundaries. Keep Brevity's content-free usage metrics separate from private conversation records. Do not infer a product's permissions from its chat interface. |
| [FamilyWall Premium](https://www.familywall.com/premium.html?lang=en) | Combines calendar sync, meal planning, budget tracking and recurring timetables. | Cross-pillar coverage is useful but not sufficient differentiation. Keep modules configurable; test whether a single request saves switching between screens. |
| [Cronometer data sources](https://support.cronometer.com/hc/en-us/articles/360018239472-Data-Sources) | Distinguishes food-data sources and package-label matching. | Preserve source identity, serving size and unknown nutrients. A brand or variant mismatch requires clarification; arithmetic correctness alone cannot certify a meal. |
| [Monarch shared views](https://help.monarch.com/hc/en-us/articles/42228648365076-Shared-Views-in-Monarch) | Household members share financial visibility; ownership filters organize the shared view. | Treat display filters and authorization as different things. Brevity's bank freshness must reflect provider evidence; shared read access must not imply permission to change accounts or execute payments. |

These decisions support the existing seven-pillar design: calendar and workload can inform daily priorities; meals, groceries and budget can inform planning; learning observations can inform tutoring. The differentiator remains a hypothesis: one conversation retrieves authorized context, completes a reviewed action, and gives useful follow-up with less effort. It is not proven by having more modules or agents.

## Patterns to avoid

- A separate specialist for every pillar before a measured failure justifies it.
- Silent writes, inferred permissions, or describing an appointment as personally assigned merely because it appears on a shared calendar.
- Counting a plan as completed activity, a forecast as posted finance, or missing nutrition as zero.
- Copying competitor ingestion, location sharing, or broad household visibility without explicit product requirements and consent.
- Measuring success with answer length, tool count, test count, or feature count alone.

## Tonight's physical-device acceptance

Owner: Larry, using his actual iPhone. Record device/browser version and deployed release, then run the sequence below. Larry subsequently reported “Everything worked” after this sequence; that is user-reported acceptance, not an agent device recording. Health connection and household pilot work were explicitly deferred on October 1.

1. Refresh Brevity. Tap the microphone and ask, “What's my schedule today?” Verify the date, assigned appointments versus shared entries, and audible response. If playback is blocked, verify that **Play response** works directly without repeating the question.
2. Ask, “Do any of those appointments conflict?” Verify follow-up continuity. Shared events belonging to different people and hotel/all-day informational spans should not be asserted as definite personal conflicts without qualification.
3. Ask for a harmless temporary task, inspect the review, and approve only after the spoken review finishes. Reload and ask for the task. Use normal Undo and verify it is gone. Do not use an external message, bank change or deletion as the voice test.
4. Interrupt a spoken response, then ask another question. Verify that old speech does not resume over the new response and no canceled review can approve a later action.
5. Ask a question that takes several seconds. Verify visible working/elapsed status, legible formatting and a clear final answer. Record any repeated microphone taps, corrections, blocked playback or abandoned turn.

A failed step is a reproducible defect, not a reason to remove review or authentication. Record the exact prompt, observed result and approximate time; do not collect passwords, bank values or private message contents in the issue.

## Applied learning, with observable outputs

| Participant | Exercise | Completion evidence |
| --- | --- | --- |
| Larry and Lorenzo | Trace a spoken request through authorized retrieval, review, persistence, audit and Undo. Explain why chat history is not the database. | One observed save/reload/readback/Undo and a short explanation in their own words. |
| Implementation owner | Inspect a tool's server authorization and reproduce a rejected cross-member or stale-version write in isolated fixtures. | Test evidence plus identification of the enforcement point. Existing automated evidence is available; participant understanding is not presumed. |
| Nutrition reviewer | Compare a spoken meal with the actual package label and portion; repeat with an ambiguous brand/size. | Recorded source/portion match or a clear clarification. No manual macro calculation required from the member. |
| Architect reviewers | Review the failed first progress prototype, corrected PR #246, preview evidence, release approval and rollback path. | Explain what failed, why the gate stopped it and what evidence justified the corrected release. |

## Pilot measurements and decision rule

Use real, consented tasks across schedule, household task, nutrition, workout, learning, study/ministry and finance questions. First establish each member's baseline using their usual method; repeat comparable tasks in Brevity. Do not create extra chores solely to inflate usage.

Record task category, member-consented pseudonym, completion or abandonment, elapsed time, manual steps, corrections, whether review matched intent, reload/readback result, and usefulness (helpful / not helpful with optional reason). Keep sensitive content in its existing protected record, not the study table. Current in-app metrics provide request/action counts, latency and ratings with missing-day coverage; they do not directly establish time saved or causal conversion.

At the first review, choose one repeated friction point backed by observations. Prepare an Architect proposal with expected benefit, risk and a measurable criterion. After release compare the same workflow and retain, revise or revert. A week of actual use is evidence that cannot be manufactured tonight. Additional households and new specialists remain conditional decisions, not overdue automatic deployment tasks.
