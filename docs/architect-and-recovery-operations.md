# Architect and recovery operations

These integrations are not considered operational until their deployed checks pass. No credential values belong in chat, repository files, workflow inputs or logs.

## Architect activation

The SDK exposes `request_approved_prototype` only through a server callback. It reads the current saved improvement record, requires Larry/Lorenzo administrator identity and an implementation-planned review by Larry/Lorenzo, and submits only the approved specification fields. A missing credential is an explicit configuration failure, not a successful prototype. Repeated dispatches of the same revision reuse a receipt; ambiguous timeouts do not auto-dispatch again.

Prepared workflow: `.github/workflows/architect-prototype.yml`.

1. Review this workflow before merging it onto the dispatch ref, main. Configure repository secret `BREVITY_ARCHITECT_OPENAI_KEY` with a scoped provider project key and an appropriate usage cap. It is exposed only to generation, which has no shell-execution tool.
2. Configure a credential restricted to Actions dispatch on `lsljco/brevity` as Netlify **production-only** `BREVITY_ARCHITECT_GITHUB_TOKEN`. Do not use an administrator-wide token or give the Netlify dispatcher repository-content write permission.
3. The generation job can read/write application source only, at most 20 files. Authentication source, hidden files, dependency manifests and workflows are excluded. It cannot run generated code.
4. The verification job installs trusted dependencies before applying the patch, then runs tests/build inside a container without network, app secrets or persisted GitHub credentials. The later branch/PR job never executes generated source.
5. **Do not enable automatic prototype PRs while Netlify previews carry production-capable credentials.** Store prefixes prevent accidental crossover; they are not a sandbox against arbitrary generated code. Establish a separate staging site/account credential scope with synthetic data, restricted provider keys and no production storage/calendar/bank/OneDrive credentials. Configure the `architect-prototype-review` GitHub environment with required reviewers.
6. Only after those controls are verified may an administrator set repository variable `BREVITY_ARCHITECT_STAGING_APPROVED=true`. Without it, the workflow stops at verified artifacts. With it, the protected job creates a draft PR; it never merges or publishes production.
7. The repository Actions setting must permit PR creation; GitHub combines create/approve capability in one switch. Larry approved enabling it; default token permissions remain read-only. The protected proposal job explicitly requests write permission and never approves, merges or publishes production.
8. Verify one synthetic packet through generation, isolated tests, reviewed draft PR and isolated staging. Record exact commit, preview and behavior evidence before `prototype-ready`. Release still requires explicit Larry/Lorenzo authorization and normal release gates.

September 30 checkpoint: scoped credentials, required-reviewer environment, and separately credentialed staging are configured. The synthetic generation → isolated verification → reviewed draft PR → staging flow passed. Real production-app dispatch is matched to workflow 36692176446. See validation/2026-09-30-final-technical-acceptance.md for current evidence and remaining feature acceptance.

## Recovery and retention

- Daily schedule 08:10 UTC dispatches a signed background backup; 08:35 UTC dispatches retention. Scheduling endpoints are platform-only. The background receiver verifies a two-minute HMAC tied to exact body and uses a once-only job receipt. It never accepts a member-provided target store.
- Background execution avoids the 30-second scheduled-function ceiling. Trusted deploy origin is embedded during build. Receipts in `brevity-maintenance-jobs` distinguish running, complete and failed work. An HTTP 202 alone is not proof of completion.
- Backups cover shared state, daily plans, meals/activities and action journals. Each record has a SHA-256 integrity hash and original metadata. Credentials, conversations, generated media and external systems are excluded. Snapshots are per-record, not transactionally consistent across stores.
- Complete backups trigger retirement of snapshots older than 30 days. Failed backups retain an incomplete manifest and never authorize restore. Recovery restore audits retain the pre-restore bytes separately.
- Conversations: latest 60 messages/30 days, clear archive seven days. Usage: 90 days. Assistant request jobs/photos: one day. Preview schedules do not run automatically; retire isolated preview stores as an explicit environment operation, or invoke the scheduled function using Netlify's authenticated Run now control.

## One-record restoration

Use the existing authorized Netlify project credential through environment configuration, never a command argument. Set `BREVITY_OPERATOR` for attribution. Run from the reviewed production revision with production build context; preview context only accesses its isolated stores.

1. In protected recovery storage, choose a **complete** snapshot manifest and its exact record ID. Review its capture time and exclusions.
2. Run `node scripts/restore-household-record.mjs review <snapshot-root> <record-id> <local-review-file>`. The file is created exclusively with mode 0600 and contains sensitive content; never attach it to a public PR.
3. Inspect exact destination, contents, capture date and impact. The review records the destination's current ETag. No household change occurs at this step.
4. Apply only that reviewed record using `node scripts/restore-household-record.mjs apply <local-review-file> <confirmed-content-hash>`. A changed ETag or hash rejects the restore. Pre-restore bytes and outcome are retained under a recovery audit ID.
5. Verify the affected app record and normal permissions. For rollback, use the retained before-image and current-version conditional write under the same operator review process; never overwrite a newer edit blindly. Remove the local sensitive review copy according to the operator's approved retention policy.

The release harness rehearses actual Blob capture, hash verification, fresh-store restoration and stale-overwrite rejection using synthetic records only. Production scheduled backup and retention completion were observed September 30; exact job IDs and UTC times are recorded in the current technical acceptance report. Passing a unit test alone does not prove these jobs are running.

Platform references: [Netlify scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/) and [Functions API](https://docs.netlify.com/build/functions/api/).
