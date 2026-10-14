# Construction Execution OS — Phase 3 contractual gate

Branch: `feature/construction-execution-os-phase3-agreement-gates-20261014`.
Status: **draft for review, no production migration or deployment**.

## Canonical integration

The authoritative project, customer, accepted quotation, contract, payment
schedule, invoice, payment request, collection, receipt, and change order
records remain the existing Business OS tables. This phase adds only the
`private.project_agreement_events` append-only audit table. No duplicate
financial entity, quote snapshot or payment ledger is introduced.

The new `project_agreement_command` accepts:
- `record_signed_pdf`: records receipt of an already-uploaded **private**
  project PDF, with a required employee evidence note. This does *not* verify
  cryptographic signatures and is not presented as an integrated e-signature.
- `owner_exception`: only a verified company owner can record an exceptional
  contractual clearance with a detailed reason and supporting reference.
  This remains an internal exception, **not** a signed agreement.
- `revoke`: appends a revocation tied to the exact most recent event;
  older evidence is immutable and the latest revocation blocks work.

The event snapshot fingerprints the canonical accepted contract source and
approved change-order set. Newly approved commercial changes invalidate a
stale clearance until a new agreement/amendment record is provided.

`private.project_agreement_authorized` requires:
1. Exactly one active canonical project contract.
2. An activated existing payment schedule for that contract.
3. A current signed-copy event or owner exception without a later revocation.
4. Matching immutable accepted-quote scope and approved changes.

Two BEFORE INSERT / UPDATE execution triggers enforce the **same** guard:
- `private.site_state.stage='execution'` (Site Delivery).
- `public.execution_plans.status='in_progress'` (Operations).

A UI button or an alternative RPC cannot create an execution state without
meeting the above conditions. Contract approval and client drawing approval
alone cannot start physical work.

## Existing UI

The existing `/dashboard/projects/[id]/site` page now has a manager-only
Agreement Readiness panel when the privileged RPC and contract access are
available. It shows the canonical contract, activated payment schedule and
recorded evidence. Signed-copy selection uses the existing protected Site
Delivery PDF store. It also supports revocation and owner-only documented
exceptions. **A previously uploaded PDF alone does not mean signing is
complete; the authorized manager must record actual signed-copy receipt.**

**Known integration gap:** The existing media upload RPC permits design
uploads in the Design phase, not after the `client_approved` transition.
An agreement PDF must currently be uploaded during that phase. A dedicated,
restricted late-agreement upload should be added before production enablement.
Do not solve it by exposing the PDFs publicly or by granting unrelated
site personnel document access.

## Tests and readiness

- Updated Site Delivery and Project Manager disposable regression fixtures to
  use a real accepted quotation response, canonical contract, PDF evidence
  record, and activated payment schedule.
- Updated Operations fixture to assert the physical plan is denied before
  agreement clearance.
- Added `tests/project-agreement.sql` for revocation, stale attempts,
  owner exceptions, non-commercial actors and cross-tenant access.
- All regression SQL runs against the reset-protected disposable PostgreSQL CI
  database. No live customer data is altered.
- Generated RPC interface types are updated with the migration.

**Not delivered in this phase:** independent structural stage certification,
stage-to-payment trigger bindings, electronic signature provider integration,
verified client portal, or complete mobile field reporting. Stage completion
still does not automatically charge or mark an invoice paid. CI and a verified
staging environment are required before any release.
