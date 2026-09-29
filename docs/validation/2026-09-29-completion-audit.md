# Completion audit and spoken activity release

## Product change

Own-member single activity records can use complete spoken readback and the exact final phrase “Apply this change”. Supported kinds: workout, progress, maintenance, study-note, sermon-note, ministry-followup, sleep and hydration. The readback includes member, date, every allowed payload field and the member-reported evidence limitation. Expense/module records, hidden identity/financial fields, other-member records, corrections and removals retain their existing on-screen flow. Existing expiry, proposal binding, scope, authorization, audit and Undo checks apply.

Local validation: 1,207 tests passed. The new executor test verifies actual isolated persistence, repeat-call deduplication, member isolation, audit and Undo. Browser regression adds activity readback/approval/receipt/reload to each viewport; these are simulated speech tests, not physical microphone acceptance.

## Recovery observation

Read Netlify production function logs without running a new backup or restoring household records. Backup dispatcher job `7ea6c0d5-c2a7-4afd-a1d8-96f0a315ca16` logged dispatched; matching background receipt logged running then complete. Visible timestamps September 29, 05:10:24–05:12:30 AM; dispatcher commit `211e359b32730abb9e01392b000b28c0ddf77279`, origin `https://main--brevityoflife.netlify.app`. This establishes a completed production-site execution. The UI schedule is `10 8 * * *`; the observed timestamp does not establish automatic triggering, so automatic schedule observation remains open. Next displayed execution: September 30, 1:10 AM PDT.

## Gates that cannot be replaced by additional code

- Physical iPhone/iPad microphone, interruption, readback and follow-up acceptance; real response latency/friction.
- Sustained household pilot, ratings and useful-action measures; broader exact-product nutrition sampling.
- Architect: staging-only authentication/provider credentials require the user’s credential-entry handoff. Synthetic app dispatch, functional staging acceptance and protected draft-PR verification remain incomplete. Do not enable the staging-approved access flag before these checks.
- Automatic production scheduler observation at a scheduled execution time.
- Additional voluntary households: explicit onboarding consent and tenant/auth/storage isolation review after pilot. The current household service is not multi-tenant.
- Human learning and competitive research participation/evidence.

The project plan is not fully complete. Existing production features and passing tests do not certify these gates.
