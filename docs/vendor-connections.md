# Vendor workspace and record connections

Finance → Vendors is the canonical directory. Vendor names are labels; `vendorId` is the relationship. Renames preserve links. Archived vendors retain historical references and protected attachments for audited Undo. Existing records are not guessed or silently joined by merchant name, date, amount or email.

| Record / screen | Relationship and behavior |
| --- | --- |
| Posted bank expenses and credits | Bank transaction ID → vendor ID in versioned vendor workspace. Explicit reviewed assignment. Pending amounts are separate from posted spending. |
| Planned / recurring expenses | Canonical finance transaction carries `vendorId`, including scoped recurring edits. New expense form requires a vendor; existing unassigned and legacy assistant-created expenses remain in the assignment queue. |
| Transaction lists, recurring, cash forecast, budgets, reports | Resolve vendor labels from the directory. Vendor A–Z / Z–A changes list order, not cash-flow dates, balances or totals. Transaction and report filters support vendor. Budget lines retain category structure. |
| Debts | Reviewed debt record carries `vendorId`; opens the same vendor. A bank payment remains separately tied by bank transaction ID; vendor assignment does not apply a payment or reduce principal. |
| Household projects | Reviewed project carries `vendorId`; current permitted contact information and a vendor link appear on the expanded project card. Legacy contractor fields are retained, not automatically merged. |
| Vendor policies / images | Immutable protected blob ID attached to vendor through Action Mode. PDF/JPEG/PNG/GIF/WebP, 3 MB each. Download access follows current vendor membership. |
| Vendor login / accounts | Encrypted blob reference, not plaintext credentials, appears in Action Mode records. Member password required for reveal. |
| Tasks / calendar | Existing task/operation occurrence and calendar source IDs remain authoritative. Vendor assignment does not fabricate a calendar appointment. |
| Project / Family Calendar | Calendar visibility is an Action Mode-reviewed project field. Family Calendar, Today, Next 7 Days and assistant schedule reads project the same canonical project ID. Dates, title, RACI and removal follow project edits and Undo. No copied calendar record or Apple write is created. Family Calendar opens the exact project. |

## Access and security

Vendor metadata defaults to administrator only. The administrator may grant named household members access in a reviewed change. Members can view permitted vendor contacts, download permitted files and unlock permitted login/account details using their own Brevity password. Financial/vendor edits remain administrator only.

Credentials and document bytes use server-managed AES-256-GCM encryption with vendor/blob/type authenticated context. Key material is stored separately in a server-only keyring. This is not end-to-end encryption; authorized infrastructure operators remain within the trust boundary. Neither login plaintext nor document bytes are stored in ordinary shared state, localStorage, assistant context or action history. Reveal and download produce access audit events. Reveal is limited to five attempts per five minutes and displayed for 60 seconds or until focus is lost. Copied values remain in the device clipboard until replaced.

Review/commit uses version checks and conditional writes. Undo restores references; encrypted staged or historical blobs are retained, not physically purged. There is no malware scanner. Downloads are attachments with `nosniff`, and executable/web file types are rejected by signature validation.

## Remaining connection work

- Explicitly assign existing unassigned expenses; no production data has been mass-matched.
- Plaid’s explicit `pending_transaction_id` is retained as `pendingTransactionId`. Posted activity resolves its original reviewed pending vendor assignment through that ID; a direct posted assignment takes precedence. No copy is persisted, so Undo of the original assignment remains effective. Records without provider lineage stay unassigned; historical cached records are not guessed or rewritten.
- This release connects vendors to expenses, debts, projects and vendor documents. It does not assert that every historical cross-module record has been reconciled.
- Brevity project/calendar visibility now uses one canonical reviewed project record. Apple publication can be reviewed per project by an administrator. Each review reads the exact source ID/version and changes one Apple snapshot with provider version checks, audit and Undo. Later source edits require republishing; removal is separately reviewed. Bulk publication and automatic cross-provider transactions remain unavailable.
- Apple Health web/server and the unsigned iPhone companion are implemented separately. Apple Developer signing/distribution and real-device consent/sync verification are still required.
