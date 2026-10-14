# Construction Execution OS — Phase 4 Stage Inspections and QC

**Status: draft feature implementation, not deployed to live Business OS.**

This implementation extends Phase 2 floor-aware planning and Phase 3 canonical
agreement gating. It **does not** introduce a competing inspections system,
task progress model, structural drawing editor, billing engine or payment ledger.

## What is implemented

1. `private.construction_stage_inspections` attaches an existing **mandatory**
   canonical `public.project_inspections` record to a specific
   `construction_project_stages` instance (including its floor). The inspection
   stays in the existing Operations engine with its frozen checklist, immutable
   decision snapshot and existing reinspection chain.
2. `private.construction_stage_reviews` stores append-only independent
   decisions by active `quality_inspector` and `structural_engineer` project
   role holders. They cannot certify work assigned to themselves. A structural
   hold requires both disciplines and two different reviewer identities.
3. `private.construction_stage_clearances` stores auditable, append-only
   project-manager certificates linked to the exact independent reviews and
   current contractual scope fingerprint. Re-certification after a later
   failed/rejected inspection requires **fresh** reviews; earlier certificates
   remain as history.
4. `construction_quality_command` and `construction_quality_read` validate
   active company/project rights. Restricted watchman, accounts-only and
   unrelated company users cannot read floor structural inspections or issue
   signatures.
5. Certification requires **all** of: a valid Phase 3 agreement, active
   canonical Operations plan, one or more completed linked Operations tasks,
   all associated mandatory formal inspections currently passed, a current QC
   approval, independent structural approval where required, and all stage
   prerequisites (including transitive ones) currently certified.
6. A stage can lose **current** certification if payment/contract scope changes,
   its agreement is revoked, a formal inspection is superseded/reopened,
   required task completion changes, or a newer reviewer decision rejects it.
   These changes do not destroy historical review or certification records.

## Existing screen integration

`/dashboard/projects/[id]/site` now includes the formal QC controls inside
each floor-based construction stage. Project managers can select the existing
Operations inspection record for the correct stage. Assigned reviewers
record approve/reject decisions with mandatory notes. Managers can certify
only once all server-side checks pass.

**No duplicate payment requests, invoices, fake progress percentages, or
self-attested structural checkboxes are created.** The canonical Operations
inspection page must still be used to issue an actual site inspection
checklist and record its results before it can be linked and certified.

## Safety and remaining work

A manager certificate is **not** a replacement for a licensed structural
engineer's legal report where required; engineer identity and qualification
verification are separate onboarding features not yet present. There is no
automated "pour allowed" control wired to every task mutation yet. The
stage-level certification acts as the currently checked handoff before the
next stage is cleared; task command gates and curing timers remain Phase 5
tasks. Handover and staged payment eligibility stay with existing canonical
Operations/Billing policies until explicit trigger mapping is added.

Review the PR, run all disposable CI suites including Operations concurrency,
and validate staging project/tenant isolation before any database migration
or release to the live Hostinger site.
