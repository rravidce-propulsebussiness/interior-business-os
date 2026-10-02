# Phase 7 local implementation and verification

Verified locally on 2026-10-02. Phase 7 now has database workflows, application command forms, reporting and protected document routes. Hosted Supabase acceptance remains outstanding. The authenticated mobile test is opt-in; the full authenticated execution, inventory and change-order browser scenarios have not been certified. This report does not claim deployment readiness.

## Architecture and workflows

| Requested report item        | Implementation                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Scope                     | Physical planning, inventory, site work, subcontractors, inspections, snags and handover extend Phase 0?6. No Phase 8 implementation.                                                                     |
| 2. Execution architecture    | Existing Project, Contract, approved estimate, Vendor and procurement records remain authoritative. Checked transactional RPCs perform writes.                                                            |
| 3. Planning model            | Accepted contract plus current approved estimate creates a plan. Approved revisions freeze schedule snapshots; a stale draft can explicitly refresh its estimate basis.                                   |
| 4. Milestones                | Configurable sequencing, dates, assignments, status and completion.                                                                                                                                       |
| 5. Tasks                     | Exact weighted progress, dependencies, cycle rejection, predecessor completion checks, dates, priorities and block reasons. Empty schedules report zero; cancelled tasks are excluded.                    |
| 6. Inventory architecture    | Immutable receipt-lot ledger. Balances are sums of signed movements, never an editable authoritative quantity.                                                                                            |
| 7. Locations                 | Organization stores, warehouses, workshops, project sites and configurable other locations.                                                                                                               |
| 8. Movements                 | Transactions group immutable legs; transfers and issues preserve the source lot and cost basis.                                                                                                           |
| 9. Material issue            | Draft request, submission, partial approval, additional approval and partial fulfillment retain outstanding requested demand. Issues require matching approved quantities.                                |
| 10. Consumption              | Explicit site consumption is distinct from issue; area, task, work-package and estimate-line references are supported.                                                                                    |
| 11. Return, scrap and damage | Separate reasons and transactions. Returns link to the original issue. Site transfers cannot bypass return linkage.                                                                                       |
| 12. Adjustment               | Authorized reasoned adjustments and physical counts append ledger differences. Reversal appends opposite legs and preserves originals.                                                                    |
| 13. Cost method              | Source accepted-receipt lot costing, exact PostgreSQL numeric arithmetic, separate protected cost tables and currency-separated summaries. No accounting recognition or currency conversion.              |
| 14. Estimated versus actual  | Planned purchase quantity/waste, ordered, received, accepted/rejected, issued, consumed, returned, scrap/damage, store/site stock, variance, shortage and surplus. Variance never silently becomes waste. |
| 15. Subcontractors           | Vendor extension, not another party master.                                                                                                                                                               |
| 16. Work orders              | Draft, issue, progress and cancellation with immutable issued scope/cost and protected document snapshots.                                                                                                |
| 17. Measurements             | Measure, verify, reject and certify; ordered-work limits and separate cost access. Certification does not create payments.                                                                                |
| 18. Inspections              | Configurable frozen checklists, required-check validation, approval and successor reinspection. Reinspection retains original requirements after template changes.                                        |
| 19. Snags                    | Creation, assignment, rectification, review, verification, closure and reopening with evidence and immutable events.                                                                                      |
| 20. Handover                 | Task/snag/current mandatory and final-inspection gates; explicit material/commercial review; acknowledgement, warranty fields, frozen customer projection and separate physical completion.               |
| 21. PDFs                     | Material issue, movement, consumption, inspection, snag and handover; also work-order and internal completion projections. Protected preview/PDF endpoints reuse the existing Chromium renderer.          |

Commercial quotation, contract, invoice and payment values are not changed by physical execution. Approved change orders continue through the existing commercial and estimate revision workflow; scope status identifies new/unestimated and removed scope. Material shortages link to existing requisition workflows.

Receiving 100, issuing 30, consuming 20, returning 5 and scrapping 2 leaves **75 at store and 3 at site**. The contradictory 70/13 example is not used.

## Schema, security and application

**22. New tables:** project_execution_members, execution_plans, execution_plan_revisions, work_packages, project_milestones, project_tasks, task_dependencies, inventory_locations, inventory_lots, inventory_lot_costs, material_issue_requests, material_issue_request_items, inventory_transactions, inventory_movements, inventory_counts, vendor_execution_profiles, subcontractor_work_orders, subcontractor_work_order_costs, work_measurements, work_measurement_costs, inspection_templates, project_inspections, project_snags, handover_templates, handover_records and project_execution_events.

**23. Migrations:** 21 additive files, 20261004000000 through 20261004002000, bring the total to 68. All 47 Phase 0?6 migration hashes still match the baseline recorded before Phase 7. Follow-up migrations fix runtime alias/column issues, draft approval nulls, additional approvals, reference-selector access and correction integrity. The optional Interior seed supplies a residence, three areas, store/site locations and quality/handover templates without fabricating accepted contracts or stock.

**24. RLS/security:** all new tenant tables force RLS. Application roles use checked RPCs rather than direct DML. Ownership, project assignment, version, entitlement and grant checks run in the database. Organization locks serialize mutations. Reads are bounded and allowlisted; cost data stays separate. New Site access is assignment-scoped; this does not retroactively narrow every Phase 0?6 surface.

**25. Permissions:** execution, milestone, task, inventory, material issue, subcontractor/work order, inspection, snag, handover and execution cost grants remain separate. Projects entitlement is required; inventory adds Purchasing and subcontracting adds Vendors. Forms repeat server-side authorization, and the database independently enforces it.

**26. Audit events:** plan/task/milestone, request, stock, subcontract, inspection, snag and handover commands append execution events with actors and transitions. The project timeline combines these with existing commercial/procurement audit history.

**27. UI routes:** /dashboard/operations provides project selection, summary and permission-filtered navigation. Entity lists/details and /command/[action] provide configuration and lifecycle forms with searchable paginated references. Dedicated /stock, /materials, /scope, /timeline, /closure and /documents pages cover balances, variance, scope, history, readiness and PDFs. Project details link to execution. The existing /dashboard/execution/costs page adds separately authorized actual-consumption and subcontract summaries.

## Verification evidence

| Requested report item   | Actual result                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 28. Unit/integration    | 149 tests passed in 24 files, using the disposable migrated PostgreSQL database. Includes strict command input, decimal preservation, nested approvals and safe document projection tests.                                                                                                                                                    |
| 29. Database assertions | Fresh empty phase7_final_verify applied all 68 migrations and repeatable seeds. 615 PASS notices across the full verifier, including reused fixture assertions; the operations suite contains 153 assertions, of which 92 are inherited Phase 6 fixture checks.                                                                               |
| 30. Concurrency         | Nine independent-session scenarios passed: receipt posting, transfer, issue, consumption, adjustment, task completion, snag closure, inspection approval and handover approval. Existing Phase 6 receiving races also remain in the suite.                                                                                                    |
| 31. Playwright          | 22 passed, 53 skipped, zero failures across 75 project/test combinations. Skips include other-app combinations and opt-in hosted tests. These results do not establish authenticated Phase 7 workflow acceptance.                                                                                                                             |
| 32. PDF verification    | Six fixtures produced 11 pages: consumption 4, snag 3, and one each for material issue, movement, inspection and handover. All pages rendered with Poppler and were visually inspected for wrapping, repeated headers, pagination and clipping. Separate database projection tests cover customer-safe handover and approved inspection data. |
| 33. Production builds   | Business App, Platform Admin and Websites passed. Business App rebuilt after the project-selection navigation change. Strict TypeScript, ESLint, generated-type drift, deterministic seed checks and client secret scanning passed; the scan checked 56 browser JavaScript files.                                                             |
| 34. Hosted Supabase     | Not performed: confirmed development credentials remain unavailable. Local PostgreSQL RLS tests do not emulate Supabase Auth/PostgREST.                                                                                                                                                                                                       |

The full suite preserves prior phase tests. No production database, external publishing, deployment or ProPulse files were changed.

## 35. Known limitations and acceptance gates

- Complete hosted Auth/PostgREST testing with confirmed development users, two tenants, assignment/permission/entitlement revocation, full execution/inventory/change-order browser flows and deployed PDF responses. The added opt-in mobile test covers plan creation and task progress only.
- Material report area filters apply to estimate and usage; procurement and stock are project-wide. Purchased means issued purchase-order quantity. Store attribution follows receipt source project, while site balances follow destination project.
- Lists and references use 25-row pages; document exports reject reports above their bounded limit rather than silently truncate. Reference labels for records without descriptive fields can fall back to a short record identifier.
- Closure combines physical readiness with commercial review. It does not automatically settle open orders, unbilled work or outstanding invoices. Staff-entered acknowledgement is not a customer signature or portal.
- Private attachments, reservations, advanced warehouses/manufacturing, attendance/payroll, full accounting and customer self-service remain deferred. Operational cost summaries are not an accounting ledger.

## 36. Phase 8 recommendation

Complete hosted Phase 7 acceptance and resolve its findings before starting Phase 8. No Phase 8 code was added.

## Reproduction

Set TEST_DATABASE_URL to a newly created disposable PostgreSQL database and ALLOW_TEST_DATABASE_RESET=yes, then run pnpm db:verify. The verifier refuses nonempty databases and never drops schemas. Run pnpm db:test for transactional regression checks, pnpm test for integration/concurrency, and pnpm check for repository verification. The concurrency test creates and drops only its own uniquely named disposable database.

For the optional mobile browser test configure E2E_LIVE_OPERATIONS=true, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, E2E_OPERATIONS_PROJECT_ID and E2E_OPERATIONS_CONTRACT_ID for a disposable accepted contract with a current approved estimate. E2E_OPERATIONS_ORG_ID is optional. Do not point these mutation tests at production.

Local evidence is in .tools/phase7-final-db.log, phase7-final-tests.log, phase7-e2e-final.log, phase7-build-final.log and phase7-business-rebuild.log. Rendered PDF fixtures are in test-results/phase7-pdf. These scratch artifacts are ignored by Git.
