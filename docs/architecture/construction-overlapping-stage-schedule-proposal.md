# Proposed construction site work planning (UNMERGED)
Status: **Design proposal / awaiting approval to implement execution-date changes**.
This branch is deliberately separate from the Foundation-payment-defaults branch and must not be merged to main now.

## Existing architecture to reuse
- Reuse existing project stage instance identifiers, dependency graph, existing on-site site checks and linked company QC; no duplicate task/inspection engine.
- Payment milestones are contractual money-request milestones, **not work completion, invoice payment, or a second stage state machine**.
- The project timeline should display planned and actual work, material deliveries and quality steps from the same stage/work/check references already approved in the quotation.
- Use project-local calendar dates and explicit timezone; store actual work event timestamps separately.

## Proposed per-work and per-check schedule
Each existing project stage checklist item should have a single scheduling record identified by
`(organization_id, project_id, stage_instance_code, item_type, item_id)`, with:
- `planned_start_date`, `planned_finish_date` (allow equal dates, both optional until planned);
- `actual_started_at`, `actual_finished_at` (recorded only by real activity, never autofilled from plan);
- `assigned_to` employee/project-role ref, `last_changed_by`, `last_changed_at`, optional `reason` / `notes`;
- `status`: not_planned, planned, ready, in_progress, blocked, inspection_pending, completed, on_hold (consistent with existing project records);
- dependencies on **other items** and independent QC/structural hold-point clearance;
- `source`: accepted quotation snapshot / project-approved change; stable IDs across edits where possible.

The planning record should be linked to the canonical stage item rather than spawning another work-progress or QC row. Protect organization scope with RLS and preserve previous dates and edits in immutable schedule-change history.

## Same-day and overlapping stages
- **Planning**: Site engineer can set/revise dates for current and next stages, even if stages are not yet physically activated; overlapping dates and dates in the same stage are allowed.
- **Execution**: Stage may begin only if project agreement/design/required structural dependencies are satisfied; start of one eligible stage does not artificially block another eligible floor/zone. If a listed dependency is still blocked, allow planning but show a blocker rather than falsely marking work started.
- **QC**: Site check/test evidence and company QC (the owner may be QC when there is no dedicated inspector) remain distinct field-site checks. A rebar or concrete pour cannot bypass required pre-pour hold points. QC fails are item-level, not blanket progress erasure.
- **Concurrent example**: Column/slab on a higher floor and masonry on an approved lower floor may be scheduled/active on the same date when their individual dependency chains and safety rules allow. Finishing on a future floor can be scheduled without activating it prematurely.
- **Calendar and project view**: Today, tomorrow, seven-day and date-range views show per-work rows grouped by stage/floor/zone, with overdue indicator, inspector or QC visit, planned vs actual and photos/notes. Mobile edit date sheet directly on the stage item; no extra Project Calendar page necessary.
- **Stage status** derives from canonical work/check/progress; do not auto-mark completed based on a date or payment.

## Payment and materials
- Payment milestone due according to agreement/quote terms (including if due when the stage starts); generate payment request/invoice only according to existing finance rules. Never mark invoice paid without a verified payment/receipt.
- The material row has planned **needed-by** date, requested/ordered/expected/received quantities/dates and marketplace/external supplier reference through existing procurement records. Do not duplicate materials under a new schedule module.
- The client sees permitted planned/actual dates, order status and inspected site updates; not unapproved QC evidence, private internal estimates or employee-only notes.

## Proposed permissions
- Owner/project manager: set and approve schedule, unlock or reassign, override non-safety planning dependencies with explicit reason and audit trail.
- Assigned site engineer/supervisor: propose/set dates for current and future authorized stages, start/complete the work assigned to them, record daily reports and photos.
- QC responsible person (owner when no independent inspector): approve/fail individual linked checks; no automatic pass from field checks.
- Client: read approved schedule + updates, propose a date preference/question for review, cannot change physical stage plans.
- Stage scheduling is an **editable plan**, not a contractual scope revision. Scope/cost changes go through quotation revision/change order.

## Before implementation
1. Map canonical project checklist item IDs and stage progress RPCs, so schedules attach to existing records.
2. Confirm permission checks, project-local date handling, and stage dependency exceptions with tests.
3. Write a backwards-compatible organization-scoped migration for new plan metadata only, never resetting projects or stage progress.
4. Implement inline date editor in Project Stage and summary view; tests for same-day overlap, two live stages, blocked QC, client permission, and no duplicated work.
5. Merge with the independently reviewed Foundation scope branch only after all payment-stage branches are approved. **Do not merge this design branch yet.**
