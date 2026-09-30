# Connected-record functionality audit — 30 September 2026

Baseline: main a23611e2fbfb334de88f4dcdc84d1a029b0236c3, PR #254, production 6abd8323fb1ed7000875a93b. Continued the same checkout and existing project/Vendor/Action Mode architecture.

## Findings and corrections

| Workflow | Finding / resulting behavior |
| --- | --- |
| Calendar identity | Title/date/time resemblance could hide unrelated events. Identity now requires source lineage or provider ID; recurring occurrences remain distinct. Missing IDs never authorize a join. |
| Project → Family Calendar | Visibility was disabled pending separate writes. A reviewed visibility field on the authoritative project now produces a read projection; there is only one versioned mutation. |
| Calendar → Project | Calendar links retain exact projectId and open its details; labels can change without breaking the connection. |
| Project dates and status | Start/end dates follow the source on all displayed days. Undated/impossible/reversed visible project windows are rejected. Project windows are not appointment attendance or evidence of task completion. |
| Permissions / audit / Undo | Existing owner/RACI/project permissions remain. A non-administrator changing a visible project also needs calendar permission. Existing journal, idempotency, conditional writes and conflict-aware Undo cover the single source. |
| Vendors / Finance | Existing exact vendor links, protected uploads, sorting, planned vs posted spending, debt application controls and canonical project→vendor navigation retained. No vendor/expense name matching or bulk production assignment. |
| Mobile command lane | A wrapped collapsed refresh banner could grow above its reserved lane and intercept calendar links. Its height now stays inside the lane; expanded details retain their separate scrollable panel. |
| Accessibility | Project edit controls now have named accessible labels; calendar project links expose exact named buttons. |

## Verification scope

Unit/server coverage exercises project review→apply→audit→Undo and permission denial, legacy data preservation, stale versions, source projection, unrelated similar events, provider boundaries, recurring identity and schedule categorization. Browser regression covers the existing Finance/Vendor/action/voice/meal/household workflows and the new calendar→exact project→visibility review on desktop, phone-sized Chromium, and both tablet orientations. CI tests the final branch source. Production acceptance is read-only: household financial records and vendor relationships are not fabricated or mass-edited for QA.

No claim of a production Apple project publication, household iPhone Health installation/consent, or longitudinal household adoption is made. Real expense assignments are still explicitly reviewed by the household; upstream bank pending-to-posted lineage remains outstanding. The dependency audit uses the existing time-limited upstream image-size/pptxgenjs exception through 1 October 2026; it does not assert zero upstream vulnerabilities.
