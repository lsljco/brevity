# Project-plan package verification — 29 September 2026

## Verified baseline and first preview

- Production remains PR #230 merge `1bd733e6ba9f01bb5644e2f5d2f088409bf09775`.
- PR #233 initial commit `0f3977030c53b6ac84504b2a28d122eedaebe83a` deployed successfully to deploy-preview-233.
- GitHub verification run **36554927240** passed on that commit.
- GitHub browser regression run **36554927413**, job **109361686622**, passed on that commit.
- Its Netlify deploy ID is **6abb90deed975500083d45cb**, observed in the deployed page.

## Follow-up package

Adds protected Architect dispatch/workflow preparation, signed background maintenance, conditional recovery command, backup rehearsal, conversation action receipts and source-scope checks. Local validation has **1,165 passing tests**, with a successful production build. A generated prototype has not been executed, and no new service credential or staging permission has been activated.

The maintained live evaluation set has 48 cases. The isolated persistence harness now has 20 checks, including activity, learning, modules, conversation restore/conflicts, metrics and backup restoration. Its in-memory conditional-store run passed; this is **not** a substitute for the actual Netlify Blob run.

## Follow-up CI

Commit `bb232030506ddb3549f979191bfddd5617f29cfb` also passed GitHub verification **36556566453** and browser regression **36556566452**. A further focused source-scope test passed, rejecting generated dependency and workflow changes.

## Current live blocker

The secure sign-in form was submitted and the app briefly displayed Larry, but authenticated APIs remained unavailable. Preview diagnostic commit `6a66f08209c6ea98a64e9c4ba212c2bdcad5a2e4` deployed successfully; the release page explicitly reports “The request did not include a session cookie.” This distinguishes missing browser-session delivery from an invalid stored session, without reading or exposing cookie values. A normal browser sign-in handoff is required; no authentication boundary was weakened. No authenticated SDK evaluation, persisted UI action, current function-log inspection, or live backup rehearsal is claimed for this package. Credentials must be entered through the secure browser sign-in handoff, never chat or a test authentication bypass.

PR #233 remains draft and unmerged. Production has not been changed by this package. See project-plan-completion-ledger.md for remaining real-world and integration gates.
