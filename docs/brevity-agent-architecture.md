# Brevity agent architecture

## Source of truth

Brevity stores household records. The agent may read them through authenticated, bounded tools. Conversation history provides context for a request, but does not replace a saved record. The model must report a tool result before claiming that an action happened.

## Phase 1: one agent

The existing Assistant UI remains the entry point. A server-side tool loop reads only the relevant pillar records, and the current Action Mode handles reviewed writes with member permissions, version checks, audit history, and Undo. The first tools are `get_pillar_records` and `estimate_meal_nutrition`. The latter returns an estimate and explicitly says it has **not** recorded a consumed meal.

The seven pillar names are spiritual, health, fitness, household, education, finance, and ministry. Tool implementations own authorization and data validation; descriptions and prompts are never a permission boundary. Browser-only snapshots remain labeled as device-specific and cannot override canonical server records.

## Next vertical slice: consumed meals

Create a separate, member-scoped meal consumption ledger rather than marking a planned meal as eaten. Each entry needs an immutable ID, member, local date/time, foods and portions, nutrition basis, per-food estimates and uncertainty, creator, revision, and correction history. A `get_daily_nutrition` read should total consumed entries and compare them with an explicitly saved target. A `log_meal` write should present the estimate and portions for review, then commit with idempotency and version checks. Corrections and Undo must update totals. Brand labels or measured ingredients should take precedence over general estimates. Never infer sodium or a protein target from absent data.

After this is reliable, add one reviewed write at a time for workout logging, household tasks, sermon notes, tutoring progress, and finance records. Existing Action Mode supports several planning, calendar, project, and finance actions already. Payment and account changes remain outside agent tools. Add proactive triggers only after record freshness, ownership, notification preferences, and duplicate suppression are tested.

## Runtime choice

The initial slice uses the Responses function-call flow already used by the app, with a bounded loop and `store:false`. The Agents SDK is a good next runtime when tool count and long-running sessions justify its runner and session adapter. A durable Brevity-owned session should preserve the member's conversation and tool receipts; the database remains authoritative. Specialist handoffs are a later optimization, not a prerequisite for cross-pillar reasoning.

## Verification gates

- A request about two pillars invokes both reads and distinguishes source freshness.
- A meal estimate never changes a saved nutrition total.
- A reviewed write is attributable to the signed-in member, retry-safe, and undoable.
- A stale or missing record cannot be represented as a completed action.
- Authenticated production checks use real saved records before claiming an end-to-end flow works.
