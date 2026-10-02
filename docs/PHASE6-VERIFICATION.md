# Phase 6 verification

Verified locally on 2026-10-01. Phase 6 implementation is complete locally; hosted production acceptance is outstanding. Phase 7 has not started. Phase 0-5 migration files and their domain boundaries remain in place.

## 1. Completed features

Business App execution navigation from Project; accepted-contract scope and approved changes; area/source/coverage display; manual, material, service and recipe estimation; conversions, waste, rounding and reasoned overrides; review/approval/revision history; material/category/variant/rate/recipe/vendor administration; requisitions; multi-vendor RFQs; manual quotes and factual comparison; split PO awards; partial accepted/rejected receipts; internal cost dashboards; four protected document types.

## 2. Remaining limitations

Hosted Auth/PostgREST and authenticated browser acceptance require configured development credentials. Local SQL uses Auth-claim shims. Therefore this report does not certify hosted deployment or end-to-end authenticated UI acceptance. The opt-in Owner workflow is implemented but skipped locally.

Master selectors load at most 250 named records; list/detail tables page by 25. Document item selectors load every page up to the supported bound. The quote editor exposes one tax component per item; SQL supports bounded component arrays and preserves existing components. Recipe quantities recalculate on save. Scope source links/identities are retained; the overview labels source type rather than a full commercial revision timeline. Historical documents retain their data but use the current renderer/font package.

Organization-wide write locking favors integrity over throughput. Drawing and supplier-document references are text only. Rejected receipt quantities consume the received allowance and do not automatically create replacements. There is no inventory, stock ledger, site consumption, workforce, project tasks, scheduling, external email, vendor portal, accounting recognition or Phase 7 functionality.

## 3. Tables added

31 public tables in 18 additive Phase 6 migrations:

- material_categories
- vendors
- vendor_contacts
- materials
- material_variants
- material_unit_conversions
- vendor_materials
- material_cost_revisions
- estimation_recipes
- estimation_recipe_items
- estimation_recipe_item_costs
- execution_estimates
- execution_estimate_revisions
- execution_estimate_scope_items
- execution_estimate_lines
- execution_estimate_line_costs
- purchase_requisitions
- purchase_requisition_items
- purchase_requisition_sources
- rfqs
- rfq_vendors
- rfq_items
- vendor_quotes
- vendor_quote_items
- purchase_orders
- purchase_order_items
- purchase_order_costs
- purchase_order_item_costs
- goods_receipts
- goods_receipt_items
- execution_estimate_documents

All force RLS. Authenticated users have SELECT privileges constrained by policy; writes use checked RPCs. Separate internal tables prevent quantity readers from retrieving rates/cost snapshots.

## 4. UI routes added

- /dashboard/execution: accepted contracts, scope coverage and workflow navigation.
- /dashboard/execution/[entity]: bounded, permission-checked lists and filters.
- /dashboard/execution/[entity]/new: named configuration and transaction forms; versioned draft edits.
- /dashboard/execution/[entity]/[id]: details, history, source links, builder, comparisons and lifecycle actions.
- /dashboard/execution/costs?project=<project-id>: authorized project cost summary.
- /dashboard/execution/[entity]/[id]/preview and /pdf: protected document rendering.
- /api/execution/[entity]: strict allowlisted, no-store reads.

The Project detail page links to Execution. Generic entity routes are allowlisted and recheck grants and entitlements; they do not permit arbitrary table access.

## 5. PDF documents

RFQ, Purchase Order, Goods/Service Receipt and Internal Execution Estimate use the existing bounded Chromium renderer. The fixtures produced 2, 5, 1 and 4 A4 pages respectively. All 12 pages were rasterized with Poppler and visually inspected: readable rows, repeated headers, page numbering, no clipping and no orphan headings. Long PO has 40 items; estimate has 24, RFQ 12, receipt 2.

HTML text is escaped; logos accept bounded PNG/JPEG data only; browser scripts and remote resources are disabled. RFQ and receipt projections omit prices. Estimate and PO documents require cost grants. Issued/approved snapshots retain business/vendor/line/rate data. Regression tests cover frozen PO snapshots after vendor/business changes and unchanged approved estimate documents after material rate replacement. Unknown vendor-quote/cost-report PDF routes are unsupported rather than exposing unprotected data.

Local QA artifacts: test-results/phase6-pdf and .tools/phase6-pdf-reviewed. Test outputs are disposable, not committed customer documents.

## 6. Procurement workflow

Current approved estimate -> source-allocated requisition -> submit/approve -> multi-vendor RFQ -> issue -> record vendor quotes -> factual comparison -> partial/split PO awards -> issue -> append partial receipts -> received/closed. Recorded quotes and issued POs are immutable. Draft orders reserve no quantity; issue checks aggregate commitments, quote capacity and current approved scope/demand, including older requisitions after an estimate reduction.

PO item -> quote item -> RFQ item -> requisition item -> requisition source -> estimate line -> commercial scope is preserved through tenant/parent foreign keys and accessible source links. Splitting/cancelling/replacing awards preserves allocated pennies without exceeding quote totals. Accepted and rejected quantities must sum to received, and cumulative receiving cannot exceed ordered quantity.

## 7. Estimate workflow

Create from an accepted contract and approved physical changes. Add material/service lines or apply a recipe; persist exact base/waste/conversion/rounding/override evidence and cost sources. All active scope must be estimated or explicitly excluded before review. Approval requires complete cost bases and current scope. Approved revisions become read-only; revisions copy scope, lines and costs, preserving predecessors. A subsequent approval supersedes the prior approved revision. Quantity/note edits retain the existing rate unless explicitly replaced.

## 8. Cost protection model

Separate quantity and cost tables; current membership, organization grants and module entitlement checks at server and SQL boundaries; no direct authenticated DML. Projects gates execution; Purchasing gates procurement; Vendors additionally gates vendor/quote work. Billing is not required for internal execution. Commercial contract values/contribution require contract.view plus Billing. Site and Designer quantity access does not grant prices; Sales has no procurement cost access. Public quotation DTOs are unchanged and exclude execution BOQ/costs.

Estimated = planning estimate. Committed = active issued PO value including allocated tax/freight. Received = proportional accepted-quantity value. These are not measured consumption, accounted cost or final profit. Unknown estimates remain unknown. Contract currencies are not combined or converted.

## 9. Concurrency handling

Independent PostgreSQL sessions verify five races in the integration suite: exactly one estimate approval succeeds; exactly one PO issue succeeds; simultaneous revision creation returns one successor; competing receipts cannot over-receive; stale quote update conflicts. Organization locks serialize demand-changing writes, while version checks reject stale UI actions. Creation/receipt retry keys validate payload identity. Additional regressions verify penny allocation after cancellation and current-demand reduction enforcement.

## 10. Tenant isolation

Foreign-tenant execution reads return no rows and mutations fail. Composite organization/parent foreign keys reject forged source relationships. Organization-scoped search/detail RPCs recheck the entity permission. Execution is tested without Billing entitlement; branch-only grants do not authorize organization-wide actions.

## 11. Security tests

SQL covers Site quantity access with separate cost-row/API/document denial, explicit Designer and Sales material/vendor/PO cost denial, historical estimate-document denial, immutable issued records, append-only receipts, safe rule allowlists, stale versions, payload retries and foreign-tenant rejection. Existing quotation/public-sharing and finance security suites remain passing. Browser tests cover anonymous protected routes/APIs/PDFs. Browser secret scan passed across 54 JavaScript files, with no privileged environment names or server secret canary.

## 12. Unit and integration tests

140 tests passed in 19 files with TEST_DATABASE_URL configured. This includes existing Phase 0-5 regression coverage, 18 execution core/document tests and the independent-session execution integration test with five race scenarios and additional snapshot/allocation regressions. No unit or integration tests were skipped in this run.

## 13. Database assertions and migration checks

Fresh disposable database phase6_release_verified: 47 migrations applied, seeds repeated, 463 assertions passed. Breakdown: isolation 80, development seed 1, catalog 57, quotations 38, CRM 70, finance 125, execution 92. Generated database types match the applied schema; catalog/CRM generated seeds match source definitions. Execution demo seed is repeatable and creates only masters/rates/recipes.

## 14. Playwright results

20 passed, 46 skipped, zero failed across 66 project/test combinations (1.5 minutes). Hosted tests and inapplicable project combinations are explicitly skipped; no skipped authenticated workflow is counted as passed.

## 15. Production builds and checks

Frozen-lockfile offline install passed with pnpm 10.34.5 / Node 24. All three applications built successfully. Business App was rebuilt after final UI changes. Lint, full TypeScript, formatting, generated-type/seed checks and browser secret scan are recorded in the local evidence logs below.

## 16. Hosted Supabase status

No hosted credentials, confirmed E2E accounts or deployment signing configuration were available. No hosted migration, Auth/PostgREST acceptance or deployment was attempted. SUPABASE.md documents the opt-in execution workflow and required disposable contract/accounts. Production acceptance remains conditional on that hosted run plus deployed permission/revocation and PDF checks. This is the only external acceptance boundary; it must not be described as passing locally.

## Reproduction and evidence

Use a new disposable database, TEST_DATABASE_URL and ALLOW_TEST_DATABASE_RESET=yes for pnpm db:verify; verification refuses nonempty databases. Set TEST_DATABASE_URL for pnpm test. Then run pnpm format:check, pnpm lint, pnpm typecheck, pnpm db:types:check, pnpm db:seed:check, pnpm build, pnpm security:client and pnpm test:e2e. See SUPABASE.md before opting into credential-bearing tests.

Local logs: .tools/phase6-install.log, phase6-final-chain.log, phase6-final-tests.log, phase6-final-lint.log, phase6-final-typecheck.log, phase6-final-build.log, phase6-final-business-build.log, phase6-final-e2e.log and phase6-pdf.log. Logs and PDF QA outputs are local artifacts. On Windows, the Playwright web-server teardown may require stopping only its test-owned listeners after all test cases finish.
