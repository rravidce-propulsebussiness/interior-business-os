# Construction Execution OS — Phase 2 integration slice

Status: **feature branch, draft review, not deployed**. This complements
`docs/CONSTRUCTION-EXECUTION-OS-ARCHITECTURE.md` and deliberately does
not claim the full system is complete.

## Implemented

- `20261014000300_construction_project_workflows.sql`: additive,
  tenant-qualified **private** project role assignments with multiple roles
  per active company employee, versioned deactivation and append-only history.
- One frozen project-specific construction planning snapshot, stage instances
  with arbitrary floor/level codes, prerequisite edges, quality-topic metadata,
  and an optional link table to **existing** `project_tasks` without copying
  progress or payment values.
- Two checked RPCs: `construction_project_read` and
  `construction_project_command`. All writes lock the canonical project.
  Only authorized company managers/project directors can assign roles or
  create snapshots; new roles alone do not inherit existing finance RPC
  permissions. The company owner must authorize director assignment.
- A construction planning panel in the existing
  `/dashboard/projects/[id]/site` page, no separate navigation app.
  Managers enter the *actual* floors in construction order, create the
  planning snapshot and assign/deactivate multiple project roles.
- SQL regression covering role coexistence, history, stale versions,
  frozen snapshot, saved dependencies, watchman plan visibility and
  cross-tenant access. Uses disposable development data and rolls back.

## Intentionally not enabled

**Planning is not construction authorization.** Every persisted stage
starts as `not_started` and that state is SQL-constrained in this slice.
No stage approval RPC, generated percent completion, automatic contract
activation, payment trigger or inspection bypass exists.

The canonical `project_tasks`, `execution_plans`,
`project_inspections`, `payment_schedule_items`,
`payment_requests`, invoices and stock ledger remain authoritative.
`construction_stage_tasks` can associate an existing task with its
stage, but does not change that task's progress, cost or approval state.

Existing `private.site_team` and `project_execution_members` are not
rewritten. The new multi-role assignments authorize the new construction
planning RPCs only; legacy Site Delivery and Operations actions continue
using their own checks. An authenticated homeowner **cannot** be inserted
as a company employee role; the verified client portal requires a separate
scoped customer-user mapping and restricted read projections.

## Next blocking work

1. An agreement execution evidence model tied to the accepted canonical
   contract and explicit, owner-authorized contractual exceptions.
2. Enforce the same agreement predicate at BOTH existing physical-work
   entry points: `project_site_command('execution_start')` and
   `operations_plan('status' -> 'in_progress')`. Update local fixtures
   to model legitimate evidenced agreements, never add test bypasses.
3. Configure stage inspection links using current frozen
   `project_inspections` and independent structural review.
4. Role-based actions across engineer/supervisor/watchman/procurement
   pathways after migrating legacy role checks safely.
5. Stage-to-`payment_schedule_items` trigger links, with idempotent
   canonical payment request issue controlled by Billing permissions.
6. Verified client-user mapping, drawings, report publishing, approved
   evidence, mobile reporting, schedule versioning, handover and warranty.
7. Test a second isolated organization/client and run hosted staging
   acceptance before considering a production migration.

## Release safeguards

No migration has been applied to a connected Supabase account.
The previous staging ID cannot currently be verified through the
available connected projects. Do not infer environment identity from
the project display name. Do not merge/deploy this isolated slice
without passing `pnpm db:verify`, `pnpm db:types:check`, `pnpm check`
and an authorized release review. Frontend integration handles a
not-yet-installed RPC without disrupting the legacy site page.
