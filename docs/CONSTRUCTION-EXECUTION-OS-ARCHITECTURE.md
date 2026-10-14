# Construction Project Execution OS — repository audit and delivery architecture

Status: **foundation branch / not deployed** (2026-10-14). This is a
repository-source audit, **not** proof of staging or production behavior.
The companion pure template definition is
`@business-os/core/construction-workflow`; its expansion is not a DB write,
an approved execution plan, or a client-facing progress calculation.

## 1. Existing architecture map

| User workflow | Existing canonical implementation | Reuse and boundary |
| --- | --- | --- |
| Identity, tenant, permissions | `organization_memberships`, `roles`, `role_permissions`, `organization_entitlements`, checked private predicates | Keep Auth and tenant checks authoritative in PostgreSQL. No self-asserted organization, project or role IDs. |
| Enquiry and customer | `leads`, `customers`, `projects` and CRM conversion RPCs | Reuse customer and project references; no duplicate homeowner or lead entity. |
| Quote acceptance | `quotation_revisions`, `quotation_customer_responses`, `contract_create` | Accepted quotation revision is an immutable commercial input, **not** a signed agreement. |
| Agreements and commercial scope | `contracts`, frozen `source_snapshot`, `change_orders` | Keep canonical contracts and approved changes; add separately audited evidence of agreement execution and enforce a physical-work gate. |
| Milestone financing | `payment_schedules`, `payment_schedule_items`, `payment_requests` | Only link stage triggers to existing schedule items. `payment_request_issue` already handles repeated live requests. |
| Billing and collections | `invoices`, `payments`, `payment_allocations`, `receipts` | Never mirror money or infer collection from stage completion. |
| Project execution plan | `execution_plans`, `execution_plan_revisions`, `project_milestones`, `work_packages`, `project_tasks`, `task_dependencies` | These are the canonical approved plan, task weights and dependency engine; extend rather than create parallel task or progress totals. |
| Procurement | Execution estimate, requisition, RFQ, PO, receipts, inventory lots and signed movements | `private.site_material_needs` is only a field request; bind it to the canonical requisition chain after approval, not a substitute purchase. |
| Formal quality | `inspection_templates`, `project_inspections`, successor reinspection, `project_snags` | Canonical pass/fail, checklist snapshots, rework and closure. `private.site_checks` are separate informal site notes; cannot certify a hold point. |
| Site delivery and files | `private.site_state`, `site_team`, `site_designs`, `site_reports`, `site_checks`, `site_gate`, `site_media`, `site_events` | Reuse site reports, manager review and existing protected media route. Keep internal project media private. |
| Manager review | `site_manager_updates`, `site_report_reviews`, `site_material_quantity_revisions` | Append-only manager instructions/reviews and quantity corrections already exist. |
| Notifications | Existing automation outbox, worker, notification preferences | Publish only authorized recipient projections, idempotently. |
| UI | `/dashboard/projects`, `/[id]`, `/[id]/site`, `/dashboard/operations` | Keep one OwnerShell/navigation and link canonical records. |

Source landmarks: `docs/PROJECT-DELIVERY.md`,
`docs/PROJECT-EXECUTION.md`, `docs/CONTRACTS.md`,
`docs/PAYMENT-SCHEDULES.md`, `docs/PAYMENTS.md`,
`docs/INSPECTIONS.md`, `docs/PROCUREMENT.md`,
`packages/core/src/operations.ts`,
`packages/database/src/operations.ts`,
`20261010000700_project_delivery.sql`,
`20261010000800_project_manager_updates.sql`, and
`20261014000200_project_site_owner_access.sql`.

## 2. Findings requiring migration before execution can be certified

1. **Contractual gate:** `project_site_command('execution_start')` currently
   checks recorded client design approval but not evidenced agreement
   execution. `operations_plan('status', ... in_progress)` is another
   physical-work entry point. Both must call a **shared database predicate**.
   Existing `contract_transition` can activate an accepted contract without
   a signed-agreement document; contract activation alone is insufficient.
2. **Project roles:** `private.site_team` has one role per user per project
   via a unique index and `private.site_role` returns one role. This cannot
   yet express multi-role staff, client membership or all requested trades.
   Add project-scoped role assignments and action grants with a legacy role
   compatibility view. Never broaden `watchman` access via the old helper.
3. **Execution hierarchy:** `site_state.stage` has only design,
   client_approved, execution and handover. Keep it as the *coarse delivery
   lifecycle*. Attach versioned construction stage instances to the existing
   approved `execution_plan_revisions` and project tasks, not to duplicate
   financial milestones.
4. **Hold points:** `private.site_checks` can be marked passed by site
   participants and do not replace independent `project_inspections`.
   Map construction hold points to the canonical formal inspection IDs,
   qualified reviewer roles and authorization snapshots.
5. **Clients:** the current site RPC is staff-only. Add a separate
   `project_client_access` authorization mapping to verified Auth users,
   project and CRM customer. Provide a restricted client read projection, not
   the staff `project_site_read` payload.
6. **Drawings:** existing site design kinds cover architectural plan, 3D,
   and structural only. New versioned document categories and client review
   are required. Retain approved/superseded revisions and freeze the release
   used by activities.
7. **Site reporting:** daily report and manager review exist, but floor,
   task, evidence links, measured progress, actual labor, version chain,
   publish rules and explicit next-day assignment need additive links.
8. **Procurement and curing:** site needs and security/curing logs do not
   yet carry canonical inventory movement links, work-item-based curing
   plans, approved schedules or compliance evidence.
9. **Media:** site media is currently private PostgreSQL bytea (8 MiB per
   asset), not a scalable private object store. Use the existing authorized
   media abstraction and introduce signed, short-lived R2 delivery only after
   storage ownership and tenant authorization are verified.
10. **Release gate:** existing docs explicitly mark hosted acceptance as
    incomplete. Code merges and local tests do not prove that the deployed
    site and its Supabase migration state match the repository.

## 3. Canonical target topology

```text
organization + permissions + entitlement
  └── CRM customer ── project ── approved quotation revision
                         ├── contract ── agreement execution evidence
                         │      ├── immutable change orders
                         │      └── activated payment schedules / items
                         │                   └── stage trigger mapping
                         │                         └── existing payment request → invoice → receipt
                         ├── approved execution plan revision
                         │      ├── project tasks + dependencies + measurable weights
                         │      ├── versioned stage instances (floor / zone)
                         │      ├── inspection gate → existing formal inspections → rework
                         │      ├── approved requisition → PO → receipt → stock → consumption
                         │      └── report / tomorrow work / curing + evidence
                         ├── project-scoped multi-role memberships
                         ├── controlled drawing revisions
                         └── verified client-project access + published projections
```

## 4. Ordered additive migration sequence

**M1 — Roles and templates.** Introduce company-scoped,
versioned industry workflow templates, stages, activity definitions and
role-action policy templates, with controlled project snapshot activation.
Project role assignments must permit multiple authorized roles per user.
Enforce tenant- and project-qualified references. Migration never rewrites
live `project_tasks`, `site_team`, or existing permission grants.

**M2 — Agreement and project scope gate.** Add append-only signed-document
reference/authorized contractual-exception records linked to an existing
contract. Clearances include actor, timestamp, reason/evidence source and an
approved-contract-scope fingerprint. A staff attestation is **not** a
verified e-signature. Only company-authorized commercial actors can record
clearance; exceptions need explicit company-owner authority and reason.
Enforce on *both* site delivery start and execution plan start in the
database. Approved scope changes invalidate stale clearance where applicable.

**M3 — Stages, dependencies and QC.** Snapshot template and approved plan
revision into stage instances with floor/zone metadata. Existing tasks are
the authoritative measurable progress source; stage percentages require
weighted task or measured quantity basis. Validate cycles and cross-floor
dependencies transactionally. Associate mandatory hold points with canonical
inspection instances. Failed checks require successor inspection/rework;
structural approvals require an independently authorized engineer. Manager
release must not override failed required checks.

**M4 — Materials, reporting and curing.** Link a reviewed site material
request to an existing procurement requisition and inventory transactions.
Extend append-only field reports with work-item, location, evidence, quantity,
labor and publish revision. Give supervisor/watchman narrow per-action RPCs.
Scheduled curing is project-specification-based, never a universal duration.

**M5 — Client access and media.** Invite/verify customer-project users,
expose allowlisted client-only views, restricted plan versions, approved
photos, certificates, tomorrow plans and existing financial *customer*
projections. Publish through checked actions and the existing outbox.
Keep private media protected behind authorized same-origin or signed access.

**M6 — UI, acceptance and deployment.** Reuse OwnerShell and current
project/operations pages with mobile-first report and command surfaces.
Verify staged migrations, generated RPC types, permission tests, static
checks, browser E2E, build and hosted smoke before enabling production.

## 5. Critical transactional invariants

- Every write checks the **active** organization membership, project
  association, industry/feature entitlement and **action grant** inside
  PostgreSQL. UI hiding is never the security boundary.
- Agreeing to a quotation, activating a contract, approving a drawing,
  certifying stage work, issuing a request, issuing an invoice and recording
  a payment are different events.
- A payment milestone maps to `payment_schedule_items.id`; stage
  certification may *enable* `payment_request_issue`, but only a qualified
  Billing actor or approved worker issues the canonical request.
- Draft and active templates use versions. An in-flight project's approved
  template snapshot is immutable; editing defaults cannot mutate project
  stage requirements.
- Drawings retain revision/supersession chains; a scope/price/time effect
  uses approved Change Orders. Do not silently modify accepted quotations.
- Inspection hold points, material acceptance and payment issuance are
  guarded by database functions/transactions, not React form state.
- Client activity/media reads use an explicit allowlist and published
  status; never expose prices, material unit costs, supplier margins,
  guard logs or internal manager notes by omission errors.
- No progress percentages, curing compliance, material quantities, photos
  or payment receipts are synthesized from templates, documents or form
  counts.

## 6. First code slice delivered with this document

`packages/core/src/construction-workflow.ts` holds the **editable
construction starter definition** and validates stage codes, graph cycles,
dependent stages, arbitrary floor lists, hold-point labels and inspection
topics. It expands parallel masonry/finishing work per floor without
inventing completion, certification, payments or code thresholds. It is
designed for future M1 migration and is deliberately **not connected to a
write endpoint yet**.

`packages/core/src/construction-workflow.test.ts` exercises floor
expansion, dependencies, hold-point metadata and template rejection.
Run `pnpm exec vitest run packages/core/src/construction-workflow.test.ts`,
then `pnpm check`. No test result or deployed behavior is asserted until
CI results are available.

## 7. Acceptance and deployment controls

Use two isolated organizations with independent active project records,
two different verified clients and all role categories. Verify negative
tests for cross-tenant/customer reads, guard access to financial rows,
self-certified structural holds, stale approvals, duplicate requests,
unapproved changes and unresolved handover checks. Verify mobile reporting
and publication after manager review. Compare migration lists to each
environment before deployment; **do not** apply production SQL to an
unverified Supabase project. Production is **NO-GO** until hosted
acceptance evidence is collected.
