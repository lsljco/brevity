# Estate implementation sequence

1. **Forensic baseline and data foundation** — inventory source, matrix, canonical model, durable repository, dry-run transform and read-only native workspace. No legacy changes.
2. **Export and reconciliation tooling** — collect every device export, identify code defaults versus live records, emit manifests/hashes, compare counts and produce exception reports.
3. **HomeHQ convergence** — move shared property projects from serialized browser state to the Estate repository, preserve local data through an explicit merge, and make HomeHQ the shared project UI rather than creating an Estate-only project engine.
4. **Systems, assets and maintenance** — first-class preventive plans, generated events/work orders, guarded lifecycle, actual-cost gate, automatic next occurrence, and Family Calendar projection are implemented. Complete the asset registry, vendor reuse and historical service reconciliation before acceptance.
5. **Vendors and Estate Vault** — normalize vendors/contracts/compliance and migrate binary files to server storage with hashes, typed relationships and permissions.
6. **Finance, insurance and utilities** — attach Estate dimensions to canonical Finance transactions; add policy, claim and utility metadata without a second ledger.
7. **Assistant and actionable surfaces** — expose read-only authoritative Estate context; add Command Center and Today signals for overdue work, budget exposure, expiring coverage and unresolved decisions. Controlled writes remain separately authorized.
8. **Migration validation** — run extract → transform → import → validate → reconcile; verify counts, values, files, relationships, calendars, finances, projects, assets, maintenance, vendors, permissions and multiple devices.
9. **Acceptance and read-only** — obtain explicit acceptance, create final backup/export, freeze Malbec writes and verify Brevity production.
10. **Sunset** — redirect users, retain cold archive, disable production only after the rollback window, and retire infrastructure as a final separately approved operation.

Each increment must be independently reviewable, tested and reversible. No phase implies permission to perform the next phase's destructive or externally visible actions.
