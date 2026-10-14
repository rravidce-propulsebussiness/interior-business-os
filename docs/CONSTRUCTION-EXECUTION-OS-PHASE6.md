# Construction Execution OS — Phase 6: Stage-linked payment eligibility

**Release status:** isolated draft feature. This is not a live Hostinger or
Supabase deployment. It depends on construction PRs #88–#92.

## Reuse the existing finance engine

The canonical `public.contracts`, `payment_schedules`,
`payment_schedule_items`, `payment_requests`, invoices, payment
allocations, payments, receipts, change orders and immutable billing
document snapshots remain unchanged. Phase 6 adds only an **append-only
link** from a specific existing contract payment item to an existing
floor-aware construction stage.

- A payment schedule item with `due_trigger='construction_stage'` must have
  at least one linked construction stage before it can be requested.
- An existing item with another `due_trigger` also becomes stage-controlled
  when a manager explicitly attaches a stage. Ordinary booking advances
  with no stage binding still use the original finance rules.
- Multiple required stages are allowed on the *same* milestone: **all** must
  hold a currently valid quality/structural/curing certificate, as must
  every transitive predecessor in the construction stage dependency graph.
- An active canonical contract, activated schedule and currently valid
  agreement evidence are required. A newer rejected QC review, failed
  reinspection, invalid curing observation or revoked agreement
  automatically blocks *future* milestone issuance.
- A BEFORE INSERT trigger on `public.payment_requests` applies the
  conditions even if the original `payment_request_issue` RPC is invoked
  directly; the new UI is not the sole enforcement point.
- Direct issue on an unmapped stage-triggered item is denied. No mapped
  milestone is created or re-linked after any existing payment request or
  milestone invoice exists, preventing retroactive qualification of issued
  finance records.
- A stage certificate makes a milestone **eligible to request**, not
  *requested*, *invoiced* or *paid*. A separately authorized user must
  explicitly issue the request. The command calls the original
  `payment_request_issue`, preserving numbered documents, immutable
  snapshots, exact schedule amounts, audit events and idempotency.
- Already-issued financial requests are never silently voided on a future
  rework event. Billing staff must review open historical requests manually
  using the canonical void/reconciliation workflows.

## Access and data separation

Binding a stage requires construction project management rights **and**
`payment_schedule.manage`. Issuing a request requires the same scoped
project-management right **and** `payment_request.create`. The read view
also requires permission to view schedules and requests. Payment amounts
and linked commercial terms do not appear in the site engineer, watchman,
quality-inspector or general client views.

Each link uses composite organization/project/contract/stage foreign keys,
private RLS, append-only history and a DB-level check. The action and
existing request engine use consistent organization/project/item row locks
to reduce concurrent binding/issuance races. Stage readiness is computed
live, never trusted from an input percentage or client-side badge.

## Existing UI

The Site Delivery workspace now includes a premium manager-only payment
milestone panel when the financial-read RPC is authorized. It displays
active contractual amounts and schedule items, attached floor/stage
requirements, current certification, eligibility, and any existing
issued request. Authorized managers can attach stages, and authorized
Billing users with project-management rights can manually issue the
existing payment request after checking eligibility.

## Limitations

The binding applies to **payment requests**, not automatic creation of
invoices or receipt recording, and it does not change existing
`invoice_issue` permissions. If a business wants invoices to be
stage-certified too, that must be an explicit separate invariant tested
on the invoice issue path. The system does not invent a stage percentage
or edit the original contract schedule. Historic issued requests remain
historically issued if site evidence is later revoked; rework and
collection-dispute handling still require manual contractual review.

No real customer data was altered and no finance account was charged.
This work must not be deployed until database, recovery, TypeScript,
unit and browser tests pass and the correct Supabase staging/live
environments have been positively identified.
