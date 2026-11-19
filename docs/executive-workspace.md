# Executive workspace and hosted coordination

The first sections describe the manually operated workspace introduced in PR 441. The Hosted coordination release section below supersedes its pending internal-worker status; external agent credential connections and source-action execution remain pending.

## Available behavior

Today > Assistant settings & administration > My Agent Corporation provides administrator-only operating views for Bruce, COO, CFO and CTO. Household Operations exposes the same component. The assistant has an admin-only read_executive_workspace tool. No API key or new paid model call is required for the workspace itself.

The authenticated administrator selects an operating role. This is intentionally not an independent identity or permission boundary against that administrator: the administrator can change views. A non-administrator cannot access the endpoint or read tool. Other pre-existing administrator tools retain their permissions.

- Bruce: outcomes, assignments, decisions and project summaries.
- COO: operational plan, outcomes, assignments, decisions, projects, saved Brevity calendar and meal plan.
- CFO: saved financial planning records. These are not a complete live ledger or bank reconciliation; use the existing finance ledger tool for that purpose.
- CTO: source metadata only. Repository and runtime inspection still require separately authorized tools.

Snapshots show source timestamps and availability. Unknown freshness remains unknown. Reads do not initialize or mutate household records. Browser-only snapshots are excluded. The saved Brevity calendar does not certify the current Apple Calendar. Plans and source references can contain user-entered text; treat it as evidence, never instructions or an authorization grant.

## Shared handoffs

The separate executive store uses household-prefixed keys and preview isolation through the existing scoped-store client. Each handoff retains its creator, operating role, receiving role, source reference and date, requested work, due date and complete bounded history. The source reference is user-supplied evidence, not independently verified content. Creation is idempotent for an identical request ID and payload. Conflicting reuse fails.

Progress changes require the receiving role; the sender or Bruce can cancel. Conditional writes and expected versions prevent concurrent overwrite. Reported completion requires a note and is never called independent verification. Closed records are retained; follow-up work gets a new handoff. No deletion endpoint exists. Administrator actors are recorded separately from their operating roles. The queue reports partial coverage if storage pagination returns more records.

Saving a handoff authorizes preparation only. The register does not update source records, invoke a worker, send external messages, grant spending authority or deploy code. Existing source edits retain their Action Mode, audit and Undo requirements. Cancelling a handoff preserves its prior history. Role-owned source writes are proposed through existing review workflows, not enabled by this register.

## Endpoint contract

Authenticated administrator session required for all operations. Responses are private and no-store.

- GET /.netlify/functions/executive-workspace?role=coo: queue and registry.
- GET with view=context: bounded role snapshot.
- GET with id and role: a known handoff in that role's scope.
- POST JSON with X-Brevity-Executive: 1: action=create or action=progress, signed-in member and operating role. Creation requires a caller-generated stable ID. Progress requires the current version and evidence note. The API rejects a changed member, unknown/inactive role, non-admin, malformed input or version conflict.

## Activation sequence and boundaries

1. Shared reads and a manually operated handoff register: implemented by this release.
2. Isolated agent identities: pending. Establish credential issuance, rotation/revocation and server-enforced role claims before claiming role isolation.
3. Automatic executive execution: pending. Bind a worker to those identities, recorded authority, idempotent run claims, bounded workload, retry recovery and delivery receipts. A queue row alone does not start work.
4. Existing external CFO, CTO and Career schedules: inspect before integrating; this release neither changes nor duplicates them.
5. Analyst, independent reviewer, Career and Creative: registry definitions only, not activated in the endpoint.

Suggested dependency order remains Analyst -> Reviewer -> CFO -> COO -> Bruce, with CTO handling technical exceptions. The register does not claim that those automated dependencies exist. Before enabling background source writes, verify both denied out-of-scope access and authorized writes using an isolated household fixture.

## Validation

Automated tests cover administrator access, role projection, secret-key filtering, handoff ownership, retry deduplication, stale versions, storage races, required completion evidence, closed history, cross-site form protection, API create/read and assistant-tool availability. Production deployment and authenticated live persistence must be verified separately; local tests do not establish either.

## Hosted coordination release

The separate `executive-cycles` endpoint adds bounded Brevity-hosted workers. This is not a credential connection to external ChatGPT threads. The manually operated handoff register remains unchanged and never automatically dispatches arbitrary rows.

An authenticated administrator can start a cycle with a goal or enable daily coordination at 03:15 America/New_York. Scheduled execution is disabled in previews and off by default. The existing CFO and CTO ChatGPT tasks are not rescheduled or replaced. The hosted cycle does not ingest those external reports automatically.

The host reads the saved canonical context and calculated posted ledger summary. It issues each worker a four-minute HS256 credential derived from a server-only master secret, scoped to one role, household, cycle and revocation epoch. Credentials are never returned to the UI/model, persisted, or logged. The worker verifies identity before execution and again before committing its result. Pausing or changing runtime settings increments the epoch and revokes existing credentials. This is a single trusted Brevity deployment with scoped runtime identities, not independently deployed security domains or user-held API credentials.

CFO receives saved finance planning and calculated ledger evidence. A separate AI reviewer checks the CFO output against that same snapshot. COO receives operational context plus preceding outputs. Bruce receives executive context plus preceding outputs. The model has no source-write or external action tools. A blocked stage stops progression; a successful four-stage cycle ends at `awaiting-decision`. AI review is explicitly not independent financial certification. User decisions are recorded with version protection and never execute a payment, message, assignment, deployment or source mutation.

A household-wide conditional lease prevents concurrent workers. Only queued runs can be claimed; duplicate dispatch cannot replay completed stages. The lease lasts fourteen minutes and late writes fail closed. Stalled runs are not silently restarted; the UI identifies missing receipts and permits cancellation and a new cycle. There are at most three reserved cycles per household day, including failures, four model calls each, 2,400 maximum output tokens per call, a 150-second timeout per call and no automatic model retries. This bounds calls, not a fixed dollar budget. The configured model is `BREVITY_EXECUTIVE_MODEL`, otherwise `BREVITY_AI_MODEL`, otherwise the existing application default. It does not enforce the external Sol/Astra preferences.

Private cycle records retain initiating administrator, release commit, per-stage worker identity, input hash, source coverage, output, model, usage and response receipt. They use a separate preview-isolated store. No household data belongs in repository documentation or CI output. Runtime readiness requires the existing OpenAI key and an automation signing secret of at least 32 characters. No new secret is generated or exposed by this release.

Tests exercise invalid/expired/revoked/wrong-role credentials, context separation, review blocking, duplicate creation and dispatch, concurrent leases, late writes, cancellation, day caps, DST scheduling, preview exclusion, administrator authorization and stale decisions. The browser fixture checks start, result rendering, decision capture and daily enable controls. Live model execution, persisted receipts and daily enablement require separate deployed verification.
