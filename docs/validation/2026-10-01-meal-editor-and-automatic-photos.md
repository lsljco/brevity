# Meal editing and automatic photos — October 1, 2026

The shared recipe detail now offers Edit meal for its title, description, serving, batch yield, ingredients, instructions, preparation/cooking minutes and all four macros. Recalculate uses the existing ingredient nutrition service. An explicit serving multiplier scales nutrition and adjusts batch yield without changing batch ingredients. Ingredient/serving/manual nutrition changes require recalculation or household verification before review.

The existing meal.recipe.update Action Mode path now accepts a strictly validated recipe edit. It retains the exact recipe ID, uses the library version captured when opening the editor, checks planning permissions, and preserves journaled execution, conflict handling and Undo. Shared plans reload after execution. Historical consumed meals are not rewritten. Manual nutrition changes clear obsolete ingredient evidence and recalculate batch totals.

Missing photos are queued on creation (including bulk import) and when existing library records load. Shared deterministic automatic job IDs and conditional claims prevent duplicate automatic generation across devices. Existing images are retained, including an upload that finishes during generation. Failed jobs have a cooldown and retain manual retry. The UI reports queued/generating/error state. Background image completion updates meal cards without requiring a refresh.

Local verification: 1,306 unit/server tests; 28 existing/new meal browser checks across desktop, phone and both iPad layouts; production build and source/bundle budgets passed. Automatic-photo browser checks and full CI are recorded on the PR.

Separate calendar architecture finding: the current Apple CalDAV integration deliberately selects one calendar by ICLOUD_CALENDAR_NAME (default Family). Importing individual Apple calendars requires an explicit multi-calendar source registry and calendar-ID-to-member mapping, not title guessing or a simple filter change. No Apple calendars or events were moved as part of this release.
