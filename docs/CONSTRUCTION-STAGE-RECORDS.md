# Construction timeline: explicit stage-to-record associations (Phase 6)

**Status:** draft, unmerged and not deployed. Requires Construction OS Phases 1–5.

## Why

Existing project-level Site Delivery reports, photos and material requests must
not be represented as records for a specific construction stage unless the
stage association has been recorded. Stage progress is controlled by canonical
Operations tasks and formal QC, not inferred from photos or material arrivals.

## Implementation

- `private.construction_stage_record_links` contains append-only, project- and
  tenant-scoped stage associations. Each record references exactly one existing
  site report, material request, photo, informal site check, curing round, or
  **canonical payment schedule item** using composite foreign keys.
- Managers can assign records to a stage. Corrections append a new event and
  the read projection selects the most recent association; historical events
  remain immutable and audit-logged.
- A legacy assigned site engineer can link only their own reports, material
  requests and ordinary field photos through the permission-checked RPC.
  This UI version exposes the association form to managers; engineers still
  upload and update site records in their normal workspace.
- Watchmen cannot link structural stages or financial records. Watchmen keep
  their curing-photo upload flow; a manager can associate those photos and
  their curing-round entries with the appropriate stage.
- The timeline shows the linked site evidence under its particular floor or
  foundation stage. Recent project-wide activity remains clearly labeled.
- Billing users see actual linked milestone labels, frozen expected amounts,
  due dates and an existing nonvoided request reference/status when available.
  This is not a paid balance, an invoice or proof of receipt.
- Management can choose only milestones in activated payment schedules linked
  to an actual contract for the same project. Linking does not request
  payment, issue an invoice, receive money or certify construction work.

## System boundaries

All records remain canonical in Site Delivery, Procurement, Finance and
Operations. Construction-stage links have no direct authenticated table
privileges; they are read/written through tenant-checked `SECURITY DEFINER`
functions. The formal stage quality/structural certificate remains separate.

Previously recorded project-wide media and quantities are **not** automatically
assigned to the current stage. Site photos remain private with existing
authenticated media routes; payment data requires separate Billing permission.

## Release sequence and checks

1. Merge/review the earlier construction PR stack (#88 → #89 → #90 → #91 →
   #110) before this draft PR. Resolve the current base-branch merge conflict.
2. On a _disposable_ database, run `pnpm db:verify`,
   `pnpm db:types:check`, the new
   `construction-stage-record-links.sql` test, lint, TypeScript, unit tests,
   builds, Playwright and cross-role/cross-tenant negative tests.
3. Apply migration `20261015000300_construction_stage_record_links.sql`
   **only** after identifying the exact live Supabase project, confirming
   prerequisite migrations and taking a verified backup.
4. Validate stage links and the payment read projection in staging, including
   multi-floor projects, watchman restrictions, invoice/payment truth, and
   repeated/changed associations.
5. Deploy the Business App only after staging acceptance. **No production
   migrations or Hostinger deployment were performed for this PR.**
