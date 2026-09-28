# Brevity agent architecture

## Source of truth

Brevity stores household records. The agent may read them through authenticated, bounded tools. Conversation history provides context for a request, but does not replace a saved record. The model must report a tool result before claiming that an action happened.

## Phase 1: one agent

The existing Assistant UI remains the entry point. The OpenAI Agents SDK runner invokes authenticated Brevity function tools, and the current Action Mode handles reviewed writes with member permissions, version checks, audit history, and Undo. The first tools are `get_pillar_records` and `estimate_meal_nutrition`. The latter returns an estimate and explicitly says it has **not** recorded a consumed meal. The agent can then propose `nutrition.meal.log` using the estimate ID. The server binds that ID to the nutrition result from the same request, checks the authenticated member and household date, and presents the resulting entry for Action Mode confirmation.

The seven pillar names are spiritual, health, fitness, household, education, finance, and ministry. Tool implementations own authorization and data validation; descriptions and prompts are never a permission boundary. Browser-only snapshots remain labeled as device-specific and cannot override canonical server records.

## Consumed meals

A separate, member-scoped, dated consumption ledger holds confirmed meals. Each entry has an ID, member, household date, ingredients and portions, the estimate and uncertainty, and the logging actor and timestamp. The health pillar read returns confirmed daily totals. Action Mode applies version checks, an immutable audit, retry recovery, and Undo; the Assistant displays the refreshed totals after confirmation. Planned meals and unconfirmed estimates are excluded.

Next: add an explicit member nutrition target, meal corrections, a clear daily food log in Health, and a measured sodium source. Brand labels or measured ingredients should take precedence over general estimates. Do not infer sodium or a protein target from absent data. The initial log records today's meal only; historical date selection needs a separate reviewed flow.

After this is reliable, add one reviewed write at a time for workout logging, household tasks, sermon notes, tutoring progress, and finance records. Existing Action Mode supports several planning, calendar, project, and finance actions already. Payment and account changes remain outside agent tools. Add proactive triggers only after record freshness, ownership, notification preferences, and duplicate suppression are tested.

## Runtime choice

The SDK runs in the Netlify function with a five-turn bound and `store:false`. Brevity retains its current per-member chat history in the UI; a durable Brevity-owned SDK session is a separate migration, with member isolation, revisions, and retention policy. The database remains authoritative. Specialist handoffs are a later optimization, not a prerequisite for cross-pillar reasoning. Tracing is disabled for the initial household deployment to avoid sending sensitive tool payloads to a separate trace store.

## Verification gates

- A request about two pillars invokes both reads and distinguishes source freshness.
- A meal estimate never changes a saved nutrition total.
- A reviewed write is attributable to the signed-in member, retry-safe, and undoable.
- A stale or missing record cannot be represented as a completed action.
- Authenticated production checks use real saved records before claiming an end-to-end flow works.
