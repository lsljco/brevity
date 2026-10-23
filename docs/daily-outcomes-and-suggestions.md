# Persistent outcomes and daily suggestions

This follows the architectural workspace release and adapts the outstanding PR #310 work to the current Today layout.

Saved outcomes can be edited, added and removed in the Household step of Alignment. There is no three-item storage limit. Today keeps the complete saved list in an expandable section. The latest explicit dated list carries across missing days until replaced; an explicitly cleared list stops inheritance. Identity, ownership and completion status remain intact. A dated outcome follows the selected day only if its date matched its source day; deliberately future-scheduled outcomes keep their dates. Reads do not create records.

Action Mode uses the same effective outcome list as Today. Review captures the effective outcome source and rejects approval if that list changes, even when the destination day still has the same stored version. Existing version checks, permissions and audit remain active. Generated plan drafts do not silently replace standing outcomes.

Today also calculates up to three suggestions from available saved outcomes, unfinished work, assigned commitments, upcoming appointments, and acknowledged shared financial goals visible to authorized viewers. Explicit urgency wins, then agreed outcomes and goals, then unfinished work and ordinary appointments. Ranking is deterministic; this is not a claim of a new autonomous AI planner or complete goal coverage across all seven pillars. Unavailable sources are not invented. Unknown appointment ownership and other members' work are excluded from My Day. Similar titles with different IDs remain separate records.

Suggestions explain their source and open Hey Brevity for discussion and Action Mode review. They do not create tasks, replace agreed outcomes, infer completion, or make financial decisions. Source IDs remain attached to the discussion request so the assistant can retrieve current records before proposing writes.
