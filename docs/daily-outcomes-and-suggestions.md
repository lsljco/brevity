# Persistent outcomes and daily suggestions

This follows the architectural workspace release and adapts the outstanding PR #310 work to the current Today layout.

Saved outcomes can be edited, added and removed in the Household step of Alignment. There is no three-item storage limit. Today keeps the complete saved list in an expandable section. The latest explicit dated list carries across missing days until replaced; an explicitly cleared list stops inheritance. Identity, ownership and completion status remain intact. A dated outcome follows the selected day only if its date matched its source day; deliberately future-scheduled outcomes keep their dates. Reads do not create records.

Action Mode uses the same effective outcome list as Today. Review captures the effective outcome source and rejects approval if that list changes, even when the destination day still has the same stored version. Existing version checks, permissions and audit remain active. Generated plan drafts do not silently replace standing outcomes.

Today also calculates up to three suggestions from available saved outcomes, unfinished work, assigned commitments, upcoming appointments, and acknowledged shared financial goals visible to authorized viewers. Explicit urgency wins, then agreed outcomes and goals, then unfinished work and ordinary appointments. Ranking is deterministic; this is not a claim of a new autonomous AI planner or complete goal coverage across all seven pillars. Unavailable sources are not invented. Unknown appointment ownership and other members' work are excluded from My Day. Similar titles with different IDs remain separate records.

Suggestions explain their source and open Hey Brevity for discussion and Action Mode review. They do not create tasks, replace agreed outcomes, infer completion, or make financial decisions. Source IDs remain attached to the discussion request so the assistant can retrieve current records before proposing writes.

## Pillar planning context and timing overlaps

Today adds a collapsed Plan in balance section. Saved dated intention fields and unfinished outcomes are shown by pillar, scoped to the current member or household. Finance context requires finance visibility. Empty context means no intention is recorded in this view, not failure or proof of misalignment. This is not a new long-term goal registry.

Both the suggested-outcomes review and pillar-balance review pass exact plan field references and source IDs to Hey Brevity. The assistant must retrieve current source records and use the existing reviewed action flow for edits. Historical and future Today views use the selected day rather than filtering appointments against the current day's clock.

Timing overlaps require explicit named participants, valid start/end times, and overlapping intervals. Different people and adjacent appointments do not conflict. Exact source IDs are deduplicated; similar titles are never merged. Canceled, completed, past and other-date records are excluded. Mirrored timeline rows have no independent IDs and are excluded. Unknown ownership, missing times and overnight intervals are reported as incomplete rather than inferred. Travel time, all-day availability, and capacity are not inferred. Calendar freshness is shown, and a lack of detected overlaps is limited to the loaded schedule.
