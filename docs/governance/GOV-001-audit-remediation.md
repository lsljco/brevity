# GOV-001 audit remediation — October 5, 2026

This release corrects the governance audit findings within the existing Action Mode architecture. It does not ratify a household policy, enable scheduled follow-up, or alter standing household ownership.

## Corrected behavior

- Routine escalation requires retained preparation, a reviewed owner intervention, the configured response interval, and a later reviewed explanation of the support/coverage outcome. Pending support must be answered or explicitly withdrawn. Evidence-backed immediate urgency can bypass the delay. No automatic fallback recipient is created.
- Independent available responsibilities and their reviewed assistance actions continue when another source is unavailable. Each case retains exact versions for its actual source dependencies. Infrastructure failures retry with bounded backoff; they do not require Lorenzo to ratify a new policy. Source names and partial coverage are disclosed.
- Recovery activation stores the actual dated override snapshots in the same journaled governance change. Exit restores only unchanged future/current occurrences, using current resource versions. Newer edits are preserved. Exit remains reviewable when coordination is paused or policy authorization expires. Legacy plans without snapshots restore only while their original Schedule version is current; otherwise exit preserves the Schedule and requires manual review of excluded occurrences.
- Consent/retention cleanup runs independently of enabled/paused/expired follow-up, including retry waiting periods. Observation eligibility is anchored to the responsibility date. Re-polling does not restart retention. Consent versions are checked before committing observations. Audit receipts are not deleted.
- Inbox items persist through quiet hours; quiet hours suppress new prompts. Processing rotates through open cases rather than permanently selecting the same first fifty. Worker-tracked dated sources can be revisited to observe completion without inventing a household audit event.
- Resolve/decision closes assistance, not the source obligation. Reopening assistance requires review. Source completion remains authoritative. Completed cases support learning. Dependencies can be removed, and support requests withdrawn.
- Policy review reminders and explicit authorization expiry are distinct. Legacy authorization retains its original expiration semantics. Defaults propose a 28-day review and 90-day authorization; both require actual review/ratification.
- Risk factors include scoring guidance. Adaptive counts are described as observed initiation/completion, not a reliability rating or character score. The original prompting method is preserved when preferences change.
- Missing linked dependencies remain unresolved until a visible source confirms closure.
- Meal calendar dragging keeps its drag origin outside rendering state so beginning a drag does not move destination controls; busy-state and same-slot guards remain enforced.
- Recovery review now forwards the per-resource expected versions through the client API.

## Validation and boundaries

Targeted tests cover escalation sequencing, recovery restoration/Undo and intervening edits, policy expiry, independent-source failure, retention and consent races, fair processing, quiet hours, cross-date completion, and completed-case learning. Browser tests cover desktop, phone, tablet and landscape tablet review controls; no production household records are mutated during verification.

Current automatic case coverage remains dated assignments, operating practices, meal readiness, and maintenance chores. Shared Health has reviewed source actions but is not yet a native automatic case source. Schedule overlap detection does not claim to account for all external calendars, travel, money, equipment, or resource conflicts across all Seven Pillars. These limitations are now explicit in the UI. Broadening those adapters remains incremental product work, not an unverified claim of complete household intelligence.

Scheduled delivery remains in-app only. Financial transactions, purchases, sensitive external communication, permission changes, and reassignment are not delegated by this release. Existing approval, member permissions, exact-version checks, audit journals, verification, and Undo remain authoritative.
