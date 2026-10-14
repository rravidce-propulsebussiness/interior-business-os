# Construction Execution OS — Phase 8: Next-day work and resource planning

**Status:** feature branch/draft review. This does not change live Hostinger or Supabase.

## Canonical implementation

Phase 8 adds append-only next-day `construction_tomorrow_plans`, exact
stage/floor binding, trade-wise planned workforce counts, linked existing
`site_material_needs` requirements, and monotonic managerial review decisions.
It operates within the existing `/dashboard/projects/[id]/site` workspace.

A site engineer or assigned supervisor can submit a plan for tomorrow or
another day up to 14 days ahead, including:

- Which floor and existing construction stage will be worked on
- Detailed work instructions (for example footing bar bending or PCC)
- Labour allocation by trade, with number of workers needed
- Material quantities linked to existing project material requirements
- Optional site precautions and working notes

Managers can approve, request changes, or withdraw the plan. An amended
plan is a new revision with a new ID; it automatically supersedes the prior
revision for the same stage and work date. Decision history and old plans
are retained. Restricted watchmen cannot read the full labour/material
planner, submit work, or approve their own plans.

## Scoped project-team access

The existing Site Delivery page now accepts active organization members
explicitly assigned to a field construction role for the same project.
This allows new construction-only supervisors, engineers, structural
reviewers, quality inspectors and watchmen to open the project workspace
without also creating a legacy `site_team` record.

Legacy Site Delivery commands still require their original, separate role
permissions. An assigned supervisor can view approved tomorrow plans but
does not gain authority to create the canonical daily report, read private
media, issue payments or change the agreement. Regression tests disable
an engineer's legacy assignment, confirm construction-only access, and
verify restricted daily reports remain hidden.

## Integration limits and integrity

- The stage ID and project/material references must belong to the same
  tenant and project. SQL/RPC authorization is independent of UI buttons.
- The original daily progress report (actual work, actual workers,
  tomorrow's free-text plan, blockers) remains canonical. The new
  structured plan is a planning instrument, **not** an actual attendance or
  completion report.
- `construction_tomorrow_materials` references the existing
  `site_material_needs` requests, preserving procurement statuses and
  supplier choices. Submission or approval **does not** purchase materials,
  increase stock, allocate vendor payments or mark material received.
- Planned worker requirements are not payroll, labour attendance or
  contractual subcontractor orders.
- The project agreement and physical execution must be active before new
  plans can be filed or approved. No invented task completion or concrete
  curing is recorded by this phase.
- The Phase 7 customer progress portal remains curated. It does **not**
  reveal the trade-level headcount or full internal material forecasts.
  Customer-facing daily work remains only the explicitly published
  manager-approved `site_reports`.

## Release verification

Disposable DB regressions cover site engineer submission, manager approval,
project-local material references, restricted watchman denial and no
automatic orders. Generated RPC types, formatting, typechecking, recovery
and browser checks must pass in GitHub before merging. Production database
identity and deployment remain unresolved until explicit verification.
