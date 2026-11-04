# Construction ERP and Project Management integration backlog

Status: incremental feature implementation, source-controlled, not proof of hosted deployment.

## Implemented in the current Project Management slice

- A dedicated owner portfolio at `/dashboard/project-management` reuses canonical authorized `projectIndex()` projects.
- The shared owner menu contains Project Management > Portfolio Overview / Projects, with Tasks and Milestones only under their respective permissions.
- The portfolio shows live project counts, actual task-derived progress, blocked/late/due-soon work, client/project search and links to canonical Operations.
- Project data are limited to existing tenant-scoped project records. Task alerts are not queried unless `task.view` is granted, and restricted/partial/error results never report fake zero counts.
- Existing authorized brochures, automations, My Work and construction pricing now have findable menu links.
- No changes to wildcard host matching, proxy, custom domains, website data or billing ledger.

## Remaining engineering work — not delivered by this slice

1. **Project budgets and BOQs:** canonical cost-code hierarchy, measured quantities, rate analysis, revisions and takeoff import. Reuse execution estimate revision and procurement allocations.
2. **Schedule management:** approved baseline, dependencies and critical-path computation; resource loading, look-ahead forecasts and delay attribution; maintain existing stage checklist dates.
3. **Site field work:** role-safe digital daily progress register, labour-gang attendance and productivity, site equipment, site safety, incident register and permit approvals.
4. **Commercial execution:** progress RA bill measurement, subcontractor claims, retention and certified payments, forecast cost-to-complete and project profitability, without double-creating invoices or receipts.
5. **Document workflows:** drawing registers, revisions, RFIs, technical submittals and NCR quality tracking.
6. **Handover support:** warranty ticket lifecycle, defect assignment, service history and customer follow-up.
7. **Provider acceptance:** verify hosted database migration, authenticated tenant A/B denial, developer deployment, backup/recovery and actual wildcard/custom-domain behavior. Existing global CI, live diagnostic and Cloudflare build issues require separate operations work.

Do not deploy unreviewed schema changes or claim complete construction ERP functionality from navigation/UI tests.
