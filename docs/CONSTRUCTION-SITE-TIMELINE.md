# Connected construction journey and site evidence

## UI
The existing Project detail page (`/dashboard/projects/[id]`) and Site Delivery
(`/dashboard/projects/[id]/site`) share `ConstructionJourney`, a single
mobile-first construction timeline. It uses the project-specific floor-stage
snapshot, linked formal inspection results and existing site records.

Each stage expands to show actual planned activities, dependencies, task count,
independently recorded formal inspections and a link to the canonical contract
schedule. The current stage additionally includes the latest site engineer
report, manager priorities, project-level material request statuses, work-start
photos and security/curing evidence.

**Data truth boundaries:** legacy `site_reports`, `site_material_needs`,
`site_media` and `site_gate` have no construction stage foreign key. They are
labeled **project-wide**, never misrepresented as belonging to one stage.
There is no fabricated percentage, completed task, date, photo, worker count or
payment receipt. Stage certification comes only from `construction_quality_read`.
Payments, invoice/receipt allocations, and purchase orders remain in canonical
Billing/Procurement. A stage-specific payment trigger is NOT implemented.

## Who can update
- Site engineer or authorized manager: daily field report, work-start and
  progress photos, workers actually on site, tomorrow's planned labour,
  tomorrow's activities and needed materials.
- Project manager: append-only manager direction/reviews, measured material
  quantity corrections before ordering, independent inspection/clearance flow.
  Existing material request action allows manager and site engineer.
- Procurement (and authorized manager): request review, seller selection,
  ordered and received status with supplier/PO reference. Recording status is
  not an automatic purchase order or receipt.
- Watchman: gate/security entries, curing rounds, then curing photos. Watchman
  can view **only curing photos uploaded by that same account**, not design,
  agreement, vendor prices or unrelated site photo records.
- Formal QC and structural inspectors: existing independent Operations
  inspections, review and clearance; no unchecked 'passed' progress is inferred.

## Migrations (draft branch only)
Apply **in order** after Phases 1–4 and environment verification:
1. `20261015000100_site_curing_photo_access.sql`
   - Add private media category `curing`.
   - Allow active authorized watchmen to upload image-only curing photos after
     recording a curing round in the previous 24h.
   - Preserve established private media limits: ≤8 MiB, max 150 project files,
     MIME magic checks, agreement-document restrictions, and tenant isolation.
   - Allow the watchman to read only their own curing media.
2. `20261015000200_site_tomorrow_labour.sql`
   - Add nullable `private.site_reports.tomorrow_workers` (0–10000).
   - Extend the existing checked `report_add` action; manager and site engineer
     retain the same permissions.
   - Return the forecast via the existing checked `project_site_read` RPC.
   - Existing reports keep NULL rather than a fictional zero.

Both migrations update SECURITY DEFINER functions via full `CREATE OR REPLACE`
implementations based on the currently stacked feature branch. They must **not**
be applied independently to an earlier production database. No live Supabase
or Hostinger deployment has been performed.

## Validation before production
- Run disposable `db:verify` and `project-delivery.sql` regression tests;
  verify generated types, TypeScript, ESLint, formatting, Playwright and Next
  production build on the merged dependency chain.
- Confirm owner, manager, site engineer, procurement, watchman and independent
  QA roles across **two organizations**. Deny cross-tenant and cross-project
  access, agreement PDFs for watchmen, self-certification and stale agreements.
- Verify zero, missing and real tomorrow labour counts. Ensure a watchman
  cannot upload before logging curing and cannot read another worker's photos.
- Verify photos load via the existing authenticated same-origin media route.
- Confirm the project page and site workspace show consistent stage status,
  no fabricated amounts, and graceful missing-RPC fallback.
- Do not merge/deploy until PRs 88–91 and this stacked PR are green/reviewed,
  and the correct hosted Supabase environment has been identified.
