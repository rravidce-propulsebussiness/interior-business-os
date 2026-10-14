# Construction OS Phase 9 integration and migration reconciliation

## Why this branch exists

Two independently CI-green Phase 9 feature branches were created from the
Phase 8 base: procurement readiness (PR #98) and watchman labour gate
(PR #102). Both independently named an additive migration
`20261014001000_...`, and both edited the Site Delivery page,
`project-manager.sql`, and the generated database RPC types. Those green
checks do **not** validate applying both branch histories in one database.

This branch extends **Phase 10 / PR #100**, whose history already contains
Phase 9 procurement-readiness PR #98, and reintroduces the _independently
reviewable_ gate-register changes as a later migration. No production
database or working main-branch files were changed by this integration.

## Deterministic migrations

- `20261014000900_construction_tomorrow_plan.sql`: existing tomorrow plans,
  stage staff access and forecasts.
- `20261014001000_construction_procurement_watch.sql`: approved-plan material
  readiness against canonical Site Delivery requests. Does not create orders.
- `20261014001100_construction_handover_stage_gate.sql`: checked stage
  dependency-chain certification before Site Delivery handover.
- `20261014001200_construction_labor_gate.sql`: structured watchman
  arrivals/departures, linked to canonical `site_gate` security events.

The unique migration numbers prevent silent omission in migration runners
that use the timestamp prefix as a unique migration identifier.

## Combined UI and permissions

`/dashboard/projects/[id]/site` retains both:

- Manager/procurement's approved next-day material demand and readiness;
- Watchman's worker arrival/departure panel and manager's reconciliation;
- The Phase 10 handover-readiness component.

The gate register does **not** expose the manager's labour forecast to
watchmen. Nor does it grant security personnel permissions to purchase,
access billing, approve attendance, or view private customer updates.
Gate headcounts are not individual HR timesheets or payroll records.

## Testing and release status

The combined `packages/database/tests/project-manager.sql` includes the
original procurement and handover safety checks and the watchman/
manager gate lifecycle regression, including departure-over-arrival denial,
stale attendance reviews and authorization boundaries.

The generated RPC catalog is merged and must match real isolated-Postgres
generation. CI on this **combined branch** is necessary; passing CI on
either source feature branch alone does not establish integration safety.
A full release also requires review of the entire stacked dependency
chain (PR #88 to #100), verified staging and production Supabase identities,
manual roles-based and mobile acceptance, and release migration plans.

No live migrations or site deployment are authorized by this document.
