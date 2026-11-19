# Executive workspace: first release

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
