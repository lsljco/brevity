# Brevity agent architecture

## Source of truth

Brevity stores household records. The agent may read them through authenticated, bounded tools. Conversation history provides context for a request, but does not replace a saved record. The model must report a tool result before claiming that an action happened.

## Phase 1: one agent

The existing Assistant UI remains the entry point. The OpenAI Agents SDK runner invokes authenticated Brevity function tools, and the current Action Mode handles reviewed writes with member permissions, version checks, audit history, and Undo. Tools include `get_pillar_records`, `search_meal_records`, product discovery and reference reading, `estimate_meal_nutrition`, and `prepare_action_review`. The last tool validates a candidate against the production action contract but performs no write. A valid candidate is attached to the reply even if the model omits it from its final structured response. The latter returns an estimate and explicitly says it has **not** recorded a consumed meal. The agent can then propose `nutrition.meal.log` using the estimate ID. The server binds that ID to the nutrition result from the same request, checks the authenticated member and household date, and presents the resulting entry for Action Mode confirmation.

The seven pillar names are spiritual, health, fitness, household, education, finance, and ministry. Tool implementations own authorization and data validation; descriptions and prompts are never a permission boundary. Browser-only snapshots remain labeled as device-specific and cannot override canonical server records.

## Consumed meals

A separate, member-scoped, dated consumption ledger holds confirmed meals. Each entry has an ID, member, household date, ingredients and portions, the estimate and uncertainty, and the logging actor and timestamp. The health pillar read returns confirmed daily totals. Action Mode applies version checks, an immutable audit, retry recovery, and Undo; the Assistant displays the refreshed totals after confirmation. Planned meals and unconfirmed estimates are excluded.

Member-owned targets, recent meal correction/removal, seven-day totals, repeat-meal review and remainder guidance are implemented. Brand labels and measured ingredients take precedence over general estimates. Fiber, sugar and sodium are retained only when supported; missing values stay unknown. Ingredient changes bind a newly calculated estimate to the exact saved entry. Title-only recipe changes preserve ingredients and nutrition. No manual macro form is required. Current label formulation and package volume must match the food consumed.

After this is reliable, add one reviewed write at a time for workout logging, household tasks, sermon notes, tutoring progress, and finance records. Existing Action Mode supports several planning, calendar, project, and finance actions already. Payment and account changes remain outside agent tools. Add proactive triggers only after record freshness, ownership, notification preferences, and duplicate suppression are tested.

## Runtime choice

The SDK runs in the Netlify function with a twelve-turn bound, followed only when necessary by bounded four-turn review/contract repair and `store:false`. Brevity retains its current per-member chat history in the UI; a durable Brevity-owned SDK session is a separate migration, with member isolation, revisions, and retention policy. The database remains authoritative. A bounded product-nutrition research specialist receives product queries and source evidence, not household records, and cannot write household data. It was introduced after observed source-discovery failures. Tracing is disabled for the initial household deployment to avoid sending sensitive tool payloads to a separate trace store.

## Verification gates

- A request about two pillars invokes both reads and distinguishes source freshness.
- A meal estimate never changes a saved nutrition total.
- A reviewed write is attributable to the signed-in member, retry-safe, and undoable.
- A stale or missing record cannot be represented as a completed action.
- Authenticated production checks use real saved records before claiming an end-to-end flow works.

## Durable preferences and governed improvements

Explicit preference requests use `member.preference.set`, scoped to the authenticated member. Food, communication, routine and accessibility categories persist in a separate per-member resource. Only the signed-in member's preferences enter their assistant context. Each category can be reviewed, replaced or cleared; writes use conditional versions, audit, retry recovery and Undo. Preferences are contextual data, never permission overrides or evidence of a meal eaten. This does not implement a durable SDK conversation session. Audit retention remains separate from clearing the active preference.

`improvement.propose` records the problem, evidence, proposed solution, benefit, risks and success metric. Larry or Lorenzo can advance the proposal through reviewed concept, prototype, release and measurement stages. Prototype evidence includes a preview URL, exact commit and evaluation summary. A release approval or rollback request records governance; it does not execute a deployment or modify code.

## Deployed verification

The preview-only administrator release page invokes the deployed SDK using synthetic records, production instructions and the actual action contract. Its nutrition calculator is a fixture: these cases measure reasoning and contract behavior, not label accuracy. Separate checks exercise the real action executor, journal and Netlify Blob persistence in a dedicated fixture store, including fresh reads, stale writes, permissions and Undo. All resource stores are injected; real household records are untouched. The route denies production access and unauthorized sessions.

Model calls recover from bounded rate-limit/provider failures. Evaluation calls are paced to avoid exhausting the household project's token allowance. Telemetry records correlation, timing, outcome and tool counts without raw conversation/tool arguments. Physical microphone behavior and household adoption remain device/pilot acceptance work.
