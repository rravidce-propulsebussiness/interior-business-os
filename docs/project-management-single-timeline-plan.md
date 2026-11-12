# ProPulse Business OS: single project timeline

## Design rule

`Project Management → All Projects → Project → Timeline` is the ordinary project path. The timeline is a projection of existing contract, design, stage snapshot, execution, schedule, QC, materials, and finance records. It must not own a parallel project state or use dates as permission to start work.

## Existing canonical paths to reuse

| Workflow | Existing source of truth |
| --- | --- |
| Accepted scope and design revisions | Frozen quotation stage snapshot; `project_agreement_command`; `project_design_command` |
| Advance and payment receipts | `project_advance_proforma_prepare`, Finance invoice/payment records, `project_advance_read` |
| Parallel stage start and structural blockers | `construction_stage_execution_command` and `construction_stage_start_blockers` |
| Work items, evidence, measurements, checks | `project_stage_checklist_command`, `project_stage_checklist_read`, site media, stage snapshot |
| Work-item materials | `project_stage_activity_material_batch` and the existing procurement/receipt workflow |
| Independent QC and certification | `construction_stage_qc_item_command`, stage QC review records, certified-stage payment request workflow |
| Curing/security observations | `private.site_gate` records and project media with watchman-scoped photo access |
| Staff membership and permissions | Project site team, organization roles, existing RLS and security-definer RPC checks |

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

### Phase 2 — close workflow gaps before production rollout

1. **Recurring curing tasks and reminders**
   - Extend the existing stage schedule/task command and read paths (`project-item-schedule.tsx`, stage schedule RPCs, and site `project_site_read`) to derive rounds only from approved engineering specifications.
   - Store round completion through the existing `site_gate` curing record and linked project media; add an authorized site-engineer path alongside watchmen.
   - Add a minimal role-filtered curing screen and a supervisor alert for overdue scheduled rounds. Do not supply default durations or mark rounds complete automatically.

2. **Work-item ownership, measurements, and optional work**
   - Extend canonical stage item metadata and existing command/read RPCs so each accepted activity can carry an assignee, measurement set, and owner-controlled optional/skip decision with a reason and audit event.
   - Keep contractual changes on the existing change-order path. Enforce legal, financial, safety, structural, and QC holds in the database command, not only the UI.

3. **Role-first timeline and homeowner view**
   - Adapt `project-v2-view.tsx` and `project-daily-command.tsx` to show an engineer's today/check/photo/material/tomorrow/QC actions first, watchmen only their assigned curing/security rounds, QC only pending reviews, and owners the complete feed.
   - Verify homeowner data through the existing client portal RPCs and expose approved drawings, owner decisions, payment requests, and recorded receipts only.

4. **End-to-end acceptance**
   - Add a disposable-database workflow scenario in `packages/database/tests/construction-project-workflows.sql` covering agreement, design revisions, parallel floors, independent QC, curing records, material requests, skip guards, idempotent stage payments, audit visibility, and client visibility.
   - Add Playwright coverage under `tests/e2e/` for role-specific screens after the database scenario is stable.

## Branch verification boundary

This branch does not apply migrations or connect to a live database. The database verifier requires an explicitly marked disposable test database (`ALLOW_TEST_DATABASE_RESET=yes`); it was not run against any configured database. Timeline navigation/feed and the signed-quotation advance issuance path are covered by local checks. The remaining workflow gaps above remain prerequisites for claiming the full requested acceptance scenario complete.
