# Construction Execution OS — Phase 10: verified stage handover gate

**Status:** isolated draft branch on Phase 9; not deployed to a hosted database.

## Canonical architecture

Site Delivery continues to own the coarse `private.site_state.stage`
transition; Operations remains responsible for tasks, final formal inspections,
snags, inventory accounting and physical handover. The new additive migration
introduces **no second handover table**, does not calculate invented progress and
does not change invoices, receipts, approved agreements or historical
certificates.

`private.construction_stage_chain_current` evaluates the existing immutable
floor-stage clearance against _all transitive predecessor stages_. This matters
when a previously approved footing or slab stage is subsequently invalidated by
a failed reinspection, reopened Operations task, changed contract scope or new
insufficient curing evidence. A later-stage certificate cannot conceal the
failed prerequisite.

The `construction_site_handover_stage_gate` database trigger runs when the
**existing** Site Delivery state is changed from execution to handover. For
projects that have opted into the construction workflow it denies the transition
until:

1. The project workflow snapshot is frozen.
2. At least one configured stage exists.
3. Every configured stage, on every floor/zone, has a _currently valid_
   independent clearance, including its whole prerequisite chain.

The existing Site Delivery handover command also checks the original site
checks, unresolved material needs and `private.ops_readiness` (task completion,
formal Operations inspections, snags, document reviews). Those checks are
**not** bypassed or replaced by this migration. Projects that have no
construction workflow retain their original Site Delivery behavior.

The new function is private and has no authenticated/anonymous grants; no staff
role can self-certify by calling it. Stage decisions still flow through the
qualified QC/structural reviewers and authorized manager commands, with
historical decisions retained.

## Verification and release constraints

The disposable `packages/database/tests/project-manager.sql` fixture checks
both a missing stage-chain certification and an attempted direct persistence
transition; the latter must fail with `23514` even when invoked as database
owner. Run the database migration and regressions on an isolated test database.
Check TypeScript, UI and CI before merging.

This increment does **not** claim to guard every independent Operations
handover record transition; its precise canonical Operations state machine must
be reviewed before adding a separate trigger. Until that work is reviewed,
release remains **NO-GO** for the full multi-route handover acceptance target.
Confirm the correct staging database and migration order before any deployment.
