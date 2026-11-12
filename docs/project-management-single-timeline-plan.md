# ProPulse Business OS: single project timeline

## Design rule

`Project Management → All Projects → Project → Timeline` is the ordinary project path. The timeline is a projection of existing contract, design, stage snapshot, execution, schedule, QC, materials, and finance records. It must not own a parallel project state or use dates as permission to start work.

## Existing canonical paths to reuse

| Workflow                                     | Existing source of truth                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Accepted scope and design revisions          | Frozen quotation stage snapshot; `project_agreement_command`; `project_design_command`                  |
| Advance and payment receipts                 | `project_advance_proforma_prepare`, Finance invoice/payment records, `project_advance_read`             |
| Parallel stage start and structural blockers | `construction_stage_execution_command` and `construction_stage_start_blockers`                          |
| Work items, evidence, measurements, checks   | `project_stage_checklist_command`, `project_stage_checklist_read`, site media, stage snapshot           |
| Work-item materials                          | `project_stage_activity_material_batch` and the existing procurement/receipt workflow                   |
| Independent QC and certification             | `construction_stage_qc_item_command`, stage QC review records, certified-stage payment request workflow |
| Curing/security observations                 | `private.site_gate` records and project media with watchman-scoped photo access                         |
| Staff membership and permissions             | Project site team, organization roles, existing RLS and security-definer RPC checks                     |

## File-level implementation plan

### Phase 1 — establish the primary timeline (implemented on this branch)

- `apps/business-app/src/app/dashboard/projects/[id]/page.tsx`: open a selected project on its Timeline.
- `apps/business-app/src/app/dashboard/owner-workspace-navigation.ts`: label the project directory action as `All Projects`.
- `apps/business-app/src/app/dashboard/projects/project-v2-view.tsx`: keep the existing Today command and canonical stage controls available from the primary timeline; add the scheduled cross-floor feed and stage anchors.
- `apps/business-app/src/app/dashboard/projects/project-timeline-feed.ts`: build a read-only chronological projection from current schedule and execution records; preserve concurrent dates and blockers.
- `apps/business-app/src/app/dashboard/projects/project-timeline-feed.test.ts`: cover chronological ordering, parallel work, blockers, and absent schedule rows.
- `apps/business-app/src/app/dashboard/projects/project-v2.css`: responsive feed styling within the existing OwnerShell design.
- `vitest.config.ts`: include the focused feed tests in the default suite.
- `apps/business-app/src/app/dashboard/projects/[id]/site/agreement-actions.ts`: after signed evidence is recorded, read the exact signed quotation revision, find its configured advance/booking milestone, and call the existing idempotent Finance proforma RPC. A signature or uploaded PDF never creates a receipt; if Finance authorization or configuration prevents issuance, the action reports that follow-up clearly.

### Phase 2 — one actionable flow per role (this branch)

Design decisions:

- **No new state engine.** Work-item state stays in `private.project_stage_activity_progress` (extended), stage start/QC stays in `construction_stage_execution`, certification stays in `construction_quality_command`, payments stay in `certified_stage_payment_requests`, curing rounds stay in `private.site_gate`, material requests stay in `private.site_material_needs`.
- **Parallel by construction.** A work item can only start inside a stage whose execution was started through `construction_stage_execution_command`, which already evaluates floor-specific dependencies and structural hold points. There is no global stage cursor.
- **Database-enforced guards.** Skipping, curing rounds, design sequencing and BOQ material references are validated in `SECURITY DEFINER` RPCs, never only in the UI.

#### Database — `packages/database/supabase/migrations/20261112120000_single_project_flow.sql`

| Area | Change |
| --- | --- |
| Work items | Extend `project_stage_activity_progress` with `in_progress`/`on_hold`/`skipped` states, `assignee_id`, `measurements`, `started_at`, `completed_at`, `skip_reason`, `change_order_id`. Add `project_stage_optional_items` (owner-added optional tasks, index ≥ 1000) and append-only `project_work_item_events` audit. |
| Work-item command | `project_work_item_command(org, project, stage, index, action, input)`: `start`, `pause`, `resume`, `measure`, `complete` (photo required), `reopen`, `assign`, `skip`, `add_optional`. Skip: owner/manager only, reason required, contracted items need an approved change order on the active contract, completed work cannot be skipped, inspection topics are never skippable. |
| Stage QC submit | `construction_stage_execution_command` counts `skipped` contracted items (with change order) as resolved and requires owner-added optional items to be completed or skipped. |
| Read model | `project_stage_checklist_read` adds assignee, measurements, timestamps, optional items and the last 300 audit events. |
| Curing | `project_curing_plans` (spec reference, date range, round times, grace — all required, no defaults). `site_gate` gains `curing_plan_id`, `round_at`, `photo_id` (one canonical record per scheduled round). `project_curing_command` (`plan_create`, `plan_cancel`, `round_record`, `round_photo`) for watchman / site engineer / manager. `project_curing_read` returns rounds as recorded / due / missed / upcoming and missed-round alerts. Nothing is ever auto-recorded. |
| Materials | `site_material_needs` gains `required_date` and `boq_item_id`. `project_work_item_material_request` accepts BOQ lines (validated against the signed contract revision) or manual lines; it never creates purchase orders, stock or supplier payments. `project_boq_items_read` exposes BOQ names/quantities without prices. |
| Design | `site_designs` gains `client_approved_at`/`client_approval_source`; `client_design_decisions` gains `design_id`. Trigger blocks structural and 3D submissions until the latest floor plan (interior layout for interiors) is technically and homeowner approved. `project_design_client_decision` records an evidenced offline homeowner decision per drawing; `client_portal_design_decide` supports per-drawing approval. Backfill marks already client-approved projects. |
| Reset | `test_reset_targets` includes the new tables. |

#### Database tests

- `packages/database/tests/single-project-flow.sql` — the full acceptance scenario (agreement → idempotent advance → verified payment → floor plan revision cycle → structural/3D → execution gate → marking/excavation measurements → PCC → reinforcement with independent pre-pour QC and certification → watchman and engineer curing → BOQ and manual tomorrow materials → concurrent third-floor slab and first-floor brickwork → hold-point blocking → stage payment request without duplicates → owner skip guards → role permissions → audit → homeowner visibility).
- `project-delivery.sql`, `project-manager.sql` — record homeowner floor-plan approval before structural/3D (new sequencing rule).
- `scripts/verify.mjs`, `scripts/test.mjs` — run the new scenario.

#### Business app — `apps/business-app/src/app/dashboard/projects/`

| File | Purpose |
| --- | --- |
| `project-flow.ts` (+ `project-flow.test.ts`) | Pure role resolution and work-item projection: today / tomorrow / blocked / awaiting QC / next action, curing alerts. No writes. |
| `project-flow-view.tsx`, `project-flow.css` | Role-first top of the Timeline: engineer (today, checks, photo/progress, request material, tomorrow, submit QC), watchman (curing and security only), QC (awaiting decisions), owner (all work, blockers, staff, milestones, approvals, missed curing). |
| `project-work-item-card.tsx` | Client card with start/pause/complete, measurement inputs, photo, owner controls (assign, skip, optional task). |
| `project-material-request-sheet.tsx` | One Request Material action: BOQ pick or manual line, quantity, unit, required date. |
| `project-curing-card.tsx` | Minimal mobile curing round screen (remarks + photo). |
| `[id]/site/work-item-actions.ts`, `[id]/site/curing-actions.ts` | Server actions calling the RPCs above. |
| `project-v2-data.ts` | Loads curing, BOQ and work-item read models. |
| `project-v2-view.tsx` | Timeline renders the role-first flow first; specialist sections stay linked. Watchmen see only the curing screen. |
| `apps/business-app/src/app/client/…` | Homeowner approves or requests changes per drawing. |

## Branch verification boundary

This branch does not apply migrations or connect to a live database. The database verifier requires an explicitly marked disposable test database (`ALLOW_TEST_DATABASE_RESET=yes`); it was not run against any configured database. Timeline navigation/feed and the signed-quotation advance issuance path are covered by local checks. The remaining workflow gaps above remain prerequisites for claiming the full requested acceptance scenario complete.
