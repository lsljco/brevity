# End-to-end operational audit — October 1, 2026

Continued the existing repository at main `5f6b062` (PR #259). Health device connection and longitudinal household pilot remain deferred by the owner. This audit does not certify those activities or claim that every external service can never fail.

## Confirmed defects corrected

| Boundary | Evidence | Correction |
| --- | --- | --- |
| Plaid API → retry | The generic all-institution HTTP 502 body became an Error without its HTTP status. The retry predicate could not recognize it. | Preserve status and curated institution error/code. Regression proves a generic 502 now retries and a persistent failure releases the spinner with its cause visible. |
| Plaid request → durable cursor | Cursor pagination had page/restart bounds, but provider calls had no explicit timeout or total time budget. | Bounded requests and a shared pagination/restart time budget. Partial pages never advance a checkpoint; existing staged receipts, CAS, verified imports and acknowledgements remain intact. |
| Failed transaction → application status | A rejected Finance refresh discarded its independent balance result. | Preserve diagnostic detail so a verified balance cannot stand in for successful transactions. |
| Operations → Today | Production Today announced no household exceptions while Operations had overdue chores and low stock. | Today reads the same maintenance/inventory sources and explicit signal IDs; updates on shared-source changes without copying records. |
| Saved chores → operating summary | The summary built a default week without supplying saved custom chores, edits or deletions. | Build from the authoritative maintenance state; test exact custom/deleted identities. |
| Calendar recovery → Today | Today read only localStorage despite the live/session fallback; an old session copy could override a newer local copy after reload. | Use the existing snapshot resolver and select the latest recovery attempt. Reject future verification timestamps as fresh. |
| Open calendar → elapsed freshness | A verified badge did not age unless another snapshot arrived. | Reevaluate every minute and on focus/visibility changes, retaining cached appointments and active refresh state. |
| Verification time → display | Some Today/calendar/settings/application verification labels used the device zone. | Display household Eastern Time consistently; operations default date also uses the household zone. |

## Verification evidence

- Baseline: 1,290 unit/server tests passed; production dependency policy passed with its existing time-limited image-size/pptxgenjs exception (not zero vulnerabilities).
- Corrected source: 1,298 unit/server tests passed, production build passed, 12 new browser regressions passed across desktop, phone, tablet portrait and landscape. Full prior regression: 298 passed / 22 expected skips; final-source CI is the release gate.
- Live production explicit Sync now completed both balance and transaction phases and displayed the latest transaction history. The screenshot's all-institution failure was not reproducible during this check; its original provider cause is unknown because the previous UI discarded it. No claim is made that a transient institution outage was repaired at the institution.
- Live read checks: saved spiritual formation and repository, Today and full workout with loaded exercise assets, member-bound consumed nutrition and unset targets, Education tutor/standards controls, Operations and calendar navigation, Finance posted/planned separation and account controls, saved Sermon Workspace and linked assets.
- Meaningful unit/server regression covers permissions, financial review, exact source identity, audit, safe Undo, source receipt validation, private member records and recovery conflicts. Browser coverage exercises reviewed workflows on controlled fixtures; production household test records are not fabricated.

Final commit, CI, deployed persistence acceptance and production retest evidence are tracked in the release PR. The audit records observed boundaries, not a guarantee that all devices or future provider requests are infallible.
