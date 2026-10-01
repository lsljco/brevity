# Family Calendar date-scope correction

User report: October's grid could be displayed while the “Planner dates” filter selected September (and the reverse), producing an apparently empty calendar.

Cause: month/year navigation state was independent of the range used to filter authoritative events and generate household occurrences. Month arrows only changed the grid.

Correction:
- One selected date range drives the month, filtered events, and derived household occurrences.
- Month view has one month picker, previous/next arrows, and This month. The separate Planner dates control is removed from Month view.
- Agenda retains its explicitly labeled Calendar dates range selector. Switching to Month expands the month containing the selected start date; switching back preserves that month's range.
- Agenda displays the selected range without silently excluding past days or truncating after 14 dates.
- Phones default to Agenda and can explicitly select Month. View visibility follows the selected mode, with touch-sized month controls.
- No source records, permissions, member filters, Apple ownership rules, or Action Mode writes are changed.

Regression coverage includes the reported previous/current/next-month mismatch; Last Month in Agenda then Month; cross-month custom ranges; full-month expansion; December/January rollover; direct month selection; and desktop, phone, portrait/landscape tablet layouts. Final CI and production verification are recorded in the associated pull request.
