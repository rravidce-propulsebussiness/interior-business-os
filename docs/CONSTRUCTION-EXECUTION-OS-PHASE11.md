# Construction Execution OS — Phase 11: Operations handover parity

Status: **draft, not deployed**. This branch builds on Phase 9 integrated gate
retry safety (PR #107) and requires its entire parent construction chain.
No production or staging database was touched.

## Gap closed

The earlier construction handover trigger
`construction_site_handover_stage_gate` guarded `private.site_state`
(`execution` → `handover`) but the canonical Operations state machine
has **a separate handover path**:

- `operations_plan('status')` can transition a plan to
  `ready_for_handover`, and then `completed` after handover approval.
- `operations_handover('approve')` approves an existing handover record and
  directly updates `public.execution_plans` to `handed_over`.

Previous Operations readiness checks covered Operations tasks, inspections
and snags, but did not consult the new construction floor-stage certificates.
A project could therefore be operationally handed over even when one
configured footing/floor-stage certificate was missing or stale.

## Additive enforcement

Migration `20261014001400_construction_operations_handover_gate.sql`
adds a single private readiness predicate based on the **existing** frozen
construction workflow and `construction_stage_chain_current` (including
transitive predecessor freshness). It then enforces this predicate using:

1. A database trigger on canonical `public.execution_plans` status changes
   to `ready_for_handover`, `handed_over`, or `completed`.
2. A database trigger on canonical `public.handover_records` changing to
   `approved`, preventing an incorrectly approved handover document before
   the plan update takes place.

The original Site Delivery guard stays in place; both handover routes now
require current independent construction-stage clearances. Projects without
a configured construction workflow preserve their former Operations behavior.

There are **no** new customer, project, task, inspection, finance, inventory,
handover, or warranty tables. Historic handover records remain untouched,
and rejected updates cannot publish new approved document snapshots.

## Regression checks

The existing disposable `packages/database/tests/project-manager.sql`
fixture now checks direct owner-level Operations status changes for readiness,
handover, and completion, plus a direct handover document approval. Every
attempt must raise a PostgreSQL `23514` constraint violation, and both
canonical records must remain unchanged. Earlier Site Delivery checks remain.

`pnpm db:verify` runs the fixture on a **new disposable PostgreSQL** instance
with `ALLOW_TEST_DATABASE_RESET=yes`; this is required before merge.
Also run `pnpm db:types:check`, `pnpm format:check`, `pnpm lint`,
`pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`.
No tests are claimed as passed by creating this branch.

## Still required for the complete acceptance target

- Reconcile all stacked construction PRs into `main` in migration order;
  do not squash away or reuse distinct migration identifiers.
- Authenticated, verified, project-scoped **client login** (the existing
  revocable bearer-link progress page is intentionally read-only and does not
  give access to agreements, payments, revision approvals, or verified
  customer acknowledgements).
- End-to-end canonical procurement issue/receipt/consumption links instead
  of only a readiness view over existing Site Delivery material needs.
- Engineer-approved controlled drawings, stage-specific technical templates
  and formal independent credentials as applicable; project templates
  remain editable only within the implemented boundaries.
- Client-facing payment dashboard, invoice and receipt projection with strict
  permission filtering; no inference of paid amounts from stage certification.
- Scalable private media storage, notification/outbox integration, roles-based
  mobile acceptance, two-company/two-client hosted security regressions.
- Confirm staging and live Supabase project identities and run migration
  preflight before any authorized deployment; the production website has not
  been changed by this PR.
