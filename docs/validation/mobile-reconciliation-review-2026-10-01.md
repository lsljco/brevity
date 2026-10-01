# Mobile reconciliation review — October 1, 2026

The iPhone screenshot exposed a global `input { width: 100% }` rule expanding a reconciliation checkbox and reducing the adjacent text to a narrow vertical strip. Recommendation rows now use a fixed checkbox column and a flexible text column, with explicit checkbox sizing overriding general Finance input styling.

Before preparing a reconciliation proposal, Finance reloads authoritative shared records, updates the displayed report, and compares the user's selected evidence against the current candidates. An unrelated balance/version update can therefore prepare a new exact-version review. Changed bank amounts, account identity, dates, or unavailable matches stop preparation and require the updated recommendations to be reviewed. Execution and Undo retain their original version checks; stale approved actions are never silently rebased or applied.

Preparation errors are displayed in the report instead of behind the fixed Back navigation control. Conflict responses explain that nothing was applied and that Review can prepare a new proposal from current records. Action API errors preserve the server code for this recovery flow.

Validation: 1,324 unit/server tests pass; eight browser checks pass across desktop, iPhone, tablet and tablet landscape. Browser checks measure checkbox/text widths, simulate a newer server version, verify zero financial writes before approval, and reject changed match evidence. Production build and source/bundle budgets pass. Full CI and production verification are recorded in the PR.
